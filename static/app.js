const state = {
  data: null,
  selectedCloIndex: 0,
  selectedVideoWeek: "all",
  sessionId: crypto.randomUUID(),
  activeAssessmentTab: null,
  mcqProgressByClo: {},
  codeProgressByClo: {},
  analysisProgressByClo: {},
  revealedSolutions: {},
  masteryByClo: {},
  hintState: {},
};

const MASTERY_STORAGE_KEY = "apt_mastery_progress_v1";
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14];

const cloListEl = document.getElementById("clo-list");
const cloTitleEl = document.getElementById("clo-title");
const cloIdEl = document.getElementById("clo-id");
const slidesContainerEl = document.getElementById("slides-container");
const summaryListEl = document.getElementById("summary-list");
const videosGridEl = document.getElementById("videos-grid");
const videoWeekFilterEl = document.getElementById("video-week-filter");
const videoCountEl = document.getElementById("video-count");
const mcqContainerEl = document.getElementById("mcq-container");

const codingTitleEl = document.getElementById("coding-title");
const exercisePromptEl = document.getElementById("exercise-prompt");
const codeEditorEl = document.getElementById("code-editor");
const codeLinesEl = document.getElementById("code-lines");
const codeHighlightEl = document.getElementById("code-highlight");
const codeFeedbackEl = document.getElementById("code-feedback");
const nextCodeEl = document.getElementById("next-code");
const codeSolutionEl = document.getElementById("code-solution");
const answerModalEl = document.getElementById("answer-modal");
const answerModalTitleEl = document.getElementById("answer-modal-title");
const answerModalMessageEl = document.getElementById("answer-modal-message");
const modalYesEl = document.getElementById("modal-yes");
const modalNoEl = document.getElementById("modal-no");

const tabMcqEl = document.getElementById("tab-mcq");
const tabCodeEl = document.getElementById("tab-code");
const tabAnalysisEl = document.getElementById("tab-analysis");
const panelMcqEl = document.getElementById("panel-mcq");
const panelCodeEl = document.getElementById("panel-code");
const panelAnalysisEl = document.getElementById("panel-analysis");

const submitCodeEl = document.getElementById("submit-code");
const confidenceContainerEl = document.getElementById("confidence-container");
const insightMasteryEl = document.getElementById("insight-mastery");
const insightStreakEl = document.getElementById("insight-streak");
const insightNextReviewEl = document.getElementById("insight-next-review");

const analysisTitleEl = document.getElementById("analysis-title");
const analysisPromptEl = document.getElementById("analysis-prompt");
const analysisSnippetEl = document.getElementById("analysis-snippet");
const analysisAnswerEl = document.getElementById("analysis-answer");
const submitAnalysisEl = document.getElementById("submit-analysis");
const nextAnalysisEl = document.getElementById("next-analysis");
const analysisFeedbackEl = document.getElementById("analysis-feedback");
const analysisConfidenceContainerEl = document.getElementById(
  "analysis-confidence-container",
);

function toStartOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(isoDate) {
  if (!isoDate) {
    return "Today";
  }

  const today = toStartOfDay();
  const target = toStartOfDay(new Date(isoDate));
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }

  return `${target.toLocaleDateString()} (${diffDays} days)`;
}

function loadMasteryProgress() {
  try {
    const raw = window.localStorage.getItem(MASTERY_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

function saveMasteryProgress() {
  window.localStorage.setItem(
    MASTERY_STORAGE_KEY,
    JSON.stringify(state.masteryByClo),
  );
}

function getMasteryRecord(cloId) {
  if (!state.masteryByClo[cloId]) {
    state.masteryByClo[cloId] = {
      masteryScore: 0,
      streak: 0,
      successes: 0,
      attempts: 0,
      nextReviewDate: null,
      lastUpdatedAt: null,
    };
  }

  return state.masteryByClo[cloId];
}

function updateMasteryAfterAttempt(cloId, success, confidence = 2) {
  const record = getMasteryRecord(cloId);
  record.attempts += 1;
  if (success) {
    record.successes += 1;
    record.streak += 1;
  } else {
    record.streak = 0;
  }

  const MASTERY_DELTAS = success ? [4, 7, 10] : [-2, -4, -8];
  const masteryDelta = MASTERY_DELTAS[Math.min(Math.max(confidence - 1, 0), 2)];
  record.masteryScore = Math.min(
    100,
    Math.max(0, record.masteryScore + masteryDelta),
  );

  const reviewStep = Math.min(
    REVIEW_INTERVAL_DAYS.length - 1,
    Math.max(0, record.streak - 1),
  );
  const intervalDays = success ? REVIEW_INTERVAL_DAYS[reviewStep] : 1;
  const reviewDate = addDays(toStartOfDay(), intervalDays);
  record.nextReviewDate = reviewDate.toISOString().slice(0, 10);
  record.lastUpdatedAt = new Date().toISOString();

  saveMasteryProgress();
  renderLearningInsights();
}

function renderLearningInsights() {
  if (!state.data) {
    return;
  }

  const clo = getSelectedClo();
  if (!clo) {
    return;
  }

  const record = getMasteryRecord(clo.id);
  insightMasteryEl.textContent = `${record.masteryScore}%`;
  insightStreakEl.textContent = String(record.streak);
  insightNextReviewEl.textContent = formatDateLabel(record.nextReviewDate);
}

function renderConfidenceRating(anchorEl, cloId, success, onRated) {
  const existing = anchorEl.querySelector(".confidence-rating");
  if (existing) {
    existing.remove();
  }

  const wrap = document.createElement("div");
  wrap.className = "confidence-rating";

  const label = document.createElement("p");
  label.className = "confidence-label";
  label.textContent = "How confident did you feel?";
  wrap.appendChild(label);

  const buttons = document.createElement("div");
  buttons.className = "confidence-buttons";

  [
    ["\u{1F615}", "Guessed", 1],
    ["\u{1F914}", "Uncertain", 2],
    ["\u{1F60A}", "Confident", 3],
  ].forEach(([emoji, text, level]) => {
    const btn = document.createElement("button");
    btn.className = "confidence-btn";
    const emojiSpan = document.createElement("span");
    emojiSpan.textContent = emoji;
    const labelSpan = document.createElement("span");
    labelSpan.className = "confidence-btn-label";
    labelSpan.textContent = text;
    btn.appendChild(emojiSpan);
    btn.appendChild(labelSpan);
    btn.onclick = () => {
      updateMasteryAfterAttempt(cloId, success, level);
      wrap.remove();
      if (onRated) {
        onRated();
      }
    };
    buttons.appendChild(btn);
  });

  wrap.appendChild(buttons);
  anchorEl.appendChild(wrap);
}

function buildHintLadder(container, hint) {
  if (!hint) {
    return;
  }

  const rawSentences = hint
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sentences = rawSentences.length > 0 ? rawSentences : [hint];
  let revealed = 1;

  const hintText = document.createElement("p");
  hintText.className = "hint-text";

  const showMoreBtn = document.createElement("button");
  showMoreBtn.className = "hint-more-btn";
  showMoreBtn.textContent = "Show more hint";

  function updateDisplay() {
    hintText.textContent = `Hint: ${sentences.slice(0, revealed).join(" ")}`;
    showMoreBtn.style.display =
      revealed >= sentences.length ? "none" : "inline-block";
  }

  showMoreBtn.onclick = () => {
    revealed = Math.min(revealed + 1, sentences.length);
    updateDisplay();
  };

  updateDisplay();
  container.appendChild(hintText);
  if (sentences.length > 1) {
    container.appendChild(showMoreBtn);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlightPythonCode(source) {
  const escaped = escapeHtml(source || "");
  const tokens = [];
  let output = escaped;

  function storeToken(html) {
    const token = `@@TOK${tokens.length}@@`;
    tokens.push(html);
    return token;
  }

  output = output.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, (match) => {
    return storeToken(`<span class="py-string">${match}</span>`);
  });

  output = output.replace(/(#.*)$/gm, (match) => {
    return storeToken(`<span class="py-comment">${match}</span>`);
  });

  output = output.replace(
    /\b(def)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    (_, kw, fn) => {
      return storeToken(
        `<span class="py-keyword">${kw}</span> <span class="py-func">${fn}</span>`,
      );
    },
  );

  output = output.replace(
    /\b(and|as|assert|async|await|break|class|continue|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b/g,
    (match) => storeToken(`<span class="py-keyword">${match}</span>`),
  );

  output = output.replace(/\b(\d+(?:\.\d+)?)\b/g, (match) => {
    return storeToken(`<span class="py-number">${match}</span>`);
  });

  tokens.forEach((token, index) => {
    output = output.replaceAll(`@@TOK${index}@@`, token);
  });

  return output;
}

function syncCodeEditorLayer() {
  const activeExercise = getCurrentExercise();
  const functionName = activeExercise?.function_name;
  let source = codeEditorEl.value || "";

  if (/^\s*class\s+/m.test(source) || /\bself\b/.test(source)) {
    const cleaned = sanitizeRenderedCode(source, functionName);
    if (cleaned !== source) {
      source = cleaned;
      codeEditorEl.value = cleaned;
    }
  }

  const lineCount = Math.max(1, source.split("\n").length);
  codeLinesEl.textContent = Array.from({ length: lineCount }, (_, index) =>
    String(index + 1),
  ).join("\n");
  codeHighlightEl.innerHTML = highlightPythonCode(source || " ");
  codeLinesEl.scrollTop = codeEditorEl.scrollTop;
  codeHighlightEl.scrollTop = codeEditorEl.scrollTop;
  codeHighlightEl.scrollLeft = codeEditorEl.scrollLeft;
}

function getPreferredIndentUnit(value, cursorPosition) {
  const linesBeforeCursor = value
    .slice(0, cursorPosition)
    .split("\n")
    .reverse();

  for (const line of linesBeforeCursor) {
    const match = line.match(/^([ \t]+)\S/);
    if (!match) {
      continue;
    }

    const leadingWhitespace = match[1];
    if (leadingWhitespace.includes("\t")) {
      return "\t";
    }

    const spacesCount = leadingWhitespace.length;
    if (spacesCount >= 4) {
      return "    ";
    }
    if (spacesCount >= 2) {
      return "  ";
    }
  }

  return "    ";
}

function indentSelectedLines(value, start, end, indentUnit) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectedText = value.slice(lineStart, end);
  const indented = selectedText.replace(/^/gm, indentUnit);
  const lineCount = selectedText.match(/(^|\n)/g)?.length || 1;
  const addedPerLine = indentUnit.length;
  const nextValue = value.slice(0, lineStart) + indented + value.slice(end);
  return {
    value: nextValue,
    selectionStart: start + addedPerLine,
    selectionEnd: end + addedPerLine * lineCount,
  };
}

function outdentSelectedLines(value, start, end, indentUnit) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectedText = value.slice(lineStart, end);
  let removedTotal = 0;

  const outdented = selectedText
    .split("\n")
    .map((line) => {
      if (line.startsWith("\t")) {
        removedTotal += 1;
        return line.slice(1);
      }

      if (indentUnit !== "\t" && line.startsWith(indentUnit)) {
        removedTotal += indentUnit.length;
        return line.slice(indentUnit.length);
      }

      if (line.startsWith(" ")) {
        const maxSpacesToRemove = indentUnit === "\t" ? 4 : indentUnit.length;
        const leadingSpaces = line.match(/^ +/)?.[0]?.length || 0;
        const spacesToRemove = Math.min(maxSpacesToRemove, leadingSpaces);
        removedTotal += spacesToRemove;
        return line.slice(spacesToRemove);
      }

      return line;
    })
    .join("\n");

  const baseRemoval = indentUnit === "\t" ? 1 : indentUnit.length;
  const nextValue = value.slice(0, lineStart) + outdented + value.slice(end);
  return {
    value: nextValue,
    selectionStart: Math.max(lineStart, start - baseRemoval),
    selectionEnd: Math.max(lineStart, end - removedTotal),
  };
}

codeEditorEl.addEventListener("input", syncCodeEditorLayer);
codeEditorEl.addEventListener("scroll", syncCodeEditorLayer);
codeEditorEl.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  const pairChars = {
    "(": ")",
    "[": "]",
    "{": "}",
    '"': '"',
    "'": "'",
  };

  const closerChars = new Set(Object.values(pairChars));

  if (pairChars[event.key]) {
    event.preventDefault();
    const start = codeEditorEl.selectionStart;
    const end = codeEditorEl.selectionEnd;
    const currentValue = codeEditorEl.value;
    const openingChar = event.key;
    const closingChar = pairChars[event.key];
    const selectedText = currentValue.slice(start, end);

    codeEditorEl.value =
      currentValue.slice(0, start) +
      openingChar +
      selectedText +
      closingChar +
      currentValue.slice(end);

    if (start === end) {
      codeEditorEl.selectionStart = start + 1;
      codeEditorEl.selectionEnd = start + 1;
    } else {
      codeEditorEl.selectionStart = start + 1;
      codeEditorEl.selectionEnd = end + 1;
    }

    syncCodeEditorLayer();
    return;
  }

  if (closerChars.has(event.key)) {
    const cursorPosition = codeEditorEl.selectionStart;
    const hasSelection =
      codeEditorEl.selectionStart !== codeEditorEl.selectionEnd;
    if (!hasSelection && codeEditorEl.value[cursorPosition] === event.key) {
      event.preventDefault();
      codeEditorEl.selectionStart = cursorPosition + 1;
      codeEditorEl.selectionEnd = cursorPosition + 1;
      syncCodeEditorLayer();
      return;
    }
  }

  if (event.key === "Backspace") {
    const start = codeEditorEl.selectionStart;
    const end = codeEditorEl.selectionEnd;
    if (start === end && start > 0) {
      const currentValue = codeEditorEl.value;
      const previousChar = currentValue[start - 1];
      const nextChar = currentValue[start];
      const matchingPairs = [
        ["(", ")"],
        ["[", "]"],
        ["{", "}"],
        ['"', '"'],
        ["'", "'"],
      ];

      const isMatchingPair = matchingPairs.some(
        ([openingChar, closingChar]) =>
          previousChar === openingChar && nextChar === closingChar,
      );

      if (isMatchingPair) {
        event.preventDefault();
        codeEditorEl.value =
          currentValue.slice(0, start - 1) + currentValue.slice(start + 1);
        codeEditorEl.selectionStart = start - 1;
        codeEditorEl.selectionEnd = start - 1;
        syncCodeEditorLayer();
        return;
      }
    }
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const start = codeEditorEl.selectionStart;
    const end = codeEditorEl.selectionEnd;
    const currentValue = codeEditorEl.value;
    const indentUnit = getPreferredIndentUnit(currentValue, start);

    const beforeCursor = currentValue.slice(0, start);
    const currentLine = beforeCursor.slice(beforeCursor.lastIndexOf("\n") + 1);
    const currentIndentation = currentLine.match(/^[ \t]*/)?.[0] || "";

    const previousChar = currentValue[start - 1];
    const nextChar = currentValue[start];
    const blockPairs = [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ];
    const isBetweenBlockPair =
      start === end &&
      blockPairs.some(
        ([openingChar, closingChar]) =>
          previousChar === openingChar && nextChar === closingChar,
      );

    if (isBetweenBlockPair) {
      const innerIndentation = `${currentIndentation}${indentUnit}`;
      codeEditorEl.value =
        currentValue.slice(0, start) +
        `\n${innerIndentation}\n${currentIndentation}` +
        currentValue.slice(end);

      const cursorPosition = start + 1 + innerIndentation.length;
      codeEditorEl.selectionStart = cursorPosition;
      codeEditorEl.selectionEnd = cursorPosition;
      syncCodeEditorLayer();
      return;
    }

    const shouldIndentMore = /:\s*$/.test(currentLine.trimEnd());
    const nextIndentation = shouldIndentMore
      ? `${currentIndentation}${indentUnit}`
      : currentIndentation;

    codeEditorEl.value =
      currentValue.slice(0, start) +
      `\n${nextIndentation}` +
      currentValue.slice(end);

    const cursorPosition = start + 1 + nextIndentation.length;
    codeEditorEl.selectionStart = cursorPosition;
    codeEditorEl.selectionEnd = cursorPosition;
    syncCodeEditorLayer();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  event.preventDefault();
  const start = codeEditorEl.selectionStart;
  const end = codeEditorEl.selectionEnd;
  const currentValue = codeEditorEl.value;
  const indentUnit = getPreferredIndentUnit(currentValue, start);

  if (start === end) {
    codeEditorEl.value =
      currentValue.slice(0, start) + indentUnit + currentValue.slice(end);
    codeEditorEl.selectionStart = start + indentUnit.length;
    codeEditorEl.selectionEnd = start + indentUnit.length;
    syncCodeEditorLayer();
    return;
  }

  const result = event.shiftKey
    ? outdentSelectedLines(currentValue, start, end, indentUnit)
    : indentSelectedLines(currentValue, start, end, indentUnit);

  codeEditorEl.value = result.value;
  codeEditorEl.selectionStart = result.selectionStart;
  codeEditorEl.selectionEnd = result.selectionEnd;
  syncCodeEditorLayer();
});

function getSelectedClo() {
  return state.data.clos[state.selectedCloIndex];
}

function setActiveTab(tab) {
  state.activeAssessmentTab = tab;
  const isMcq = tab === "mcq";
  const isCode = tab === "code";
  const isAnalysis = tab === "analysis";
  tabMcqEl.classList.toggle("active", isMcq);
  tabCodeEl.classList.toggle("active", isCode);
  tabAnalysisEl.classList.toggle("active", isAnalysis);
  panelMcqEl.classList.toggle("active", isMcq);
  panelCodeEl.classList.toggle("active", isCode);
  panelAnalysisEl.classList.toggle("active", isAnalysis);

  if (isMcq) {
    renderMcq();
  }
  if (isAnalysis) {
    renderCodingAnalysis();
  }
}

function getCurrentMcqProgress() {
  const clo = getSelectedClo();
  if (!state.mcqProgressByClo[clo.id]) {
    state.mcqProgressByClo[clo.id] = {
      currentQuestionId: null,
      usedQuestionIds: [],
    };
  }
  return state.mcqProgressByClo[clo.id];
}

function pickNextQuestionForClo(clo, progress) {
  if (!clo.mcq || clo.mcq.length === 0) {
    return null;
  }

  const remaining = clo.mcq.filter(
    (question) => !progress.usedQuestionIds.includes(question.id),
  );

  if (remaining.length === 0) {
    progress.usedQuestionIds = [];
    return clo.mcq[Math.floor(Math.random() * clo.mcq.length)];
  }

  return remaining[Math.floor(Math.random() * remaining.length)];
}

function shuffledIndices(length) {
  const indices = Array.from({ length }, (_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function renderCloButtons() {
  cloListEl.innerHTML = "";
  state.data.clos.forEach((clo, index) => {
    const button = document.createElement("button");
    button.className = `clo-btn ${index === state.selectedCloIndex ? "active" : ""}`;
    button.textContent = `${clo.id}: ${clo.title}`;
    button.onclick = () => {
      state.selectedCloIndex = index;
      state.selectedVideoWeek = "all";
      renderAll();
    };
    cloListEl.appendChild(button);
  });
}

function renderSummary() {
  const clo = getSelectedClo();
  cloTitleEl.textContent = clo.title;
  cloIdEl.textContent = clo.id;

  summaryListEl.innerHTML = "";
  clo.summary.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    summaryListEl.appendChild(li);
  });

  renderLearningInsights();
}

function renderSlides() {
  const clo = getSelectedClo();
  const slides = clo.slides || [];
  slidesContainerEl.innerHTML = "";

  if (!slides.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "videos-empty";
    emptyState.textContent = "No slides available for this CLO yet.";
    slidesContainerEl.appendChild(emptyState);
    return;
  }

  slides.forEach((slide, index) => {
    const card = document.createElement("div");
    card.className = "slide-card";

    const title = document.createElement("p");
    title.className = "slide-title";
    title.textContent = slide.title || `Slide ${index + 1}`;

    const frame = document.createElement("iframe");
    frame.className = "slide-frame";
    frame.src = slide.url;
    frame.title = slide.title || `Slide ${index + 1}`;
    frame.loading = "lazy";

    card.appendChild(title);
    card.appendChild(frame);
    slidesContainerEl.appendChild(card);
  });
}

function getYouTubeVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("youtu.be")) {
      return parsedUrl.pathname.replace("/", "");
    }
    if (parsedUrl.hostname.includes("youtube.com")) {
      return parsedUrl.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

function extractWeekLabel(title = "") {
  const match = title.match(/Week\s*(\d+)/i);
  if (!match) {
    return null;
  }
  return `Week ${Number(match[1])}`;
}

function renderVideoWeekFilter(videos) {
  const weekLabels = [];
  videos.forEach((video) => {
    const weekLabel = extractWeekLabel(video.title || "");
    if (weekLabel && !weekLabels.includes(weekLabel)) {
      weekLabels.push(weekLabel);
    }
  });

  videoWeekFilterEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All weeks";
  videoWeekFilterEl.appendChild(allOption);

  weekLabels.forEach((weekLabel) => {
    const option = document.createElement("option");
    option.value = weekLabel;
    option.textContent = weekLabel;
    videoWeekFilterEl.appendChild(option);
  });

  const currentValueExists =
    state.selectedVideoWeek === "all" ||
    weekLabels.includes(state.selectedVideoWeek);
  if (!currentValueExists) {
    state.selectedVideoWeek = "all";
  }

  videoWeekFilterEl.value = state.selectedVideoWeek;
}

function renderVideos() {
  const clo = getSelectedClo();
  const videos = clo.videos || [];
  renderVideoWeekFilter(videos);
  videosGridEl.innerHTML = "";

  if (!videos.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "videos-empty";
    emptyState.textContent = "No videos added for this CLO yet.";
    videosGridEl.appendChild(emptyState);
    return;
  }

  const filteredVideos =
    state.selectedVideoWeek === "all"
      ? videos
      : videos.filter(
          (video) =>
            extractWeekLabel(video.title || "") === state.selectedVideoWeek,
        );

  videoCountEl.textContent = `Showing ${filteredVideos.length} of ${videos.length} videos`;

  if (!filteredVideos.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "videos-empty";
    emptyState.textContent = "No videos found for the selected week.";
    videosGridEl.appendChild(emptyState);
    return;
  }

  filteredVideos.forEach((video, index) => {
    const card = document.createElement("a");
    card.className = "video-card";
    card.href = video.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const videoId = getYouTubeVideoId(video.url);
    const thumbnail = document.createElement("img");
    thumbnail.className = "video-thumbnail";
    thumbnail.alt = video.title || `Video ${index + 1}`;
    thumbnail.loading = "lazy";
    thumbnail.src = videoId
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : "https://img.youtube.com/vi/0/hqdefault.jpg";

    const title = document.createElement("div");
    title.className = "video-title";
    title.textContent = video.title || `Video ${index + 1}`;

    card.appendChild(thumbnail);
    card.appendChild(title);
    videosGridEl.appendChild(card);
  });
}

videoWeekFilterEl.addEventListener("change", () => {
  state.selectedVideoWeek = videoWeekFilterEl.value;
  renderVideos();
});

function renderMcq() {
  const clo = getSelectedClo();
  mcqContainerEl.innerHTML = "";

  if (!clo.mcq || clo.mcq.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "videos-empty";
    emptyState.textContent = "No MCQ questions available for this CLO yet.";
    mcqContainerEl.appendChild(emptyState);
    return;
  }

  const progress = getCurrentMcqProgress();
  let question = clo.mcq.find((item) => item.id === progress.currentQuestionId);
  if (!question) {
    question = pickNextQuestionForClo(clo, progress);
    progress.currentQuestionId = question?.id ?? null;
  }

  if (!question) {
    return;
  }

  const card = document.createElement("div");
  card.className = "mcq-card";

  const progressText = document.createElement("p");
  progressText.className = "mcq-progress";
  progressText.textContent = `Question ${progress.usedQuestionIds.length + 1} of ${clo.mcq.length}`;
  card.appendChild(progressText);

  const title = document.createElement("p");
  title.textContent = question.question;
  card.appendChild(title);

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "options";

  const optionOrder = shuffledIndices(question.options.length);
  optionOrder.forEach((originalIndex) => {
    const option = question.options[originalIndex];
    const label = document.createElement("label");
    label.className = "option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = question.id;
    input.value = originalIndex;

    const span = document.createElement("span");
    span.textContent = option;

    label.appendChild(input);
    label.appendChild(span);
    optionsWrap.appendChild(label);
  });

  card.appendChild(optionsWrap);

  const submitBtn = document.createElement("button");
  submitBtn.className = "secondary";
  submitBtn.textContent = "Submit Answer";

  const nextBtn = document.createElement("button");
  nextBtn.className = "primary";
  nextBtn.textContent = "Next Question";
  nextBtn.style.display = "none";

  const feedback = document.createElement("div");
  feedback.className = "feedback";
  feedback.style.display = "none";

  submitBtn.onclick = async () => {
    const selected = card.querySelector(`input[name="${question.id}"]:checked`);
    if (!selected) {
      feedback.style.display = "block";
      feedback.className = "feedback error";
      feedback.textContent = "Please choose an option before submitting.";
      return;
    }

    const response = await fetch("/api/assess/mcq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clo_id: clo.id,
        question_id: question.id,
        selected_index: Number(selected.value),
      }),
    });

    const result = await response.json();
    feedback.innerHTML = "";
    feedback.style.display = "block";
    feedback.className = `feedback ${result.correct ? "success" : "error"}`;

    if (!result.correct && result.selected_option_text) {
      const wrongLine = document.createElement("p");
      wrongLine.className = "mcq-wrong-choice";
      wrongLine.textContent = `You chose: ${result.selected_option_text}`;
      feedback.appendChild(wrongLine);

      if (result.correct_option_text) {
        const revealAnswerBtn = document.createElement("button");
        revealAnswerBtn.className = "hint-more-btn";
        revealAnswerBtn.textContent = "Show answer";

        const correctLine = document.createElement("p");
        correctLine.className = "mcq-correct-choice";
        correctLine.textContent = `Correct answer: ${result.correct_option_text}`;
        correctLine.style.display = "none";

        revealAnswerBtn.onclick = () => {
          correctLine.style.display = "block";
          revealAnswerBtn.remove();
          submitBtn.disabled = true;
          card
            .querySelectorAll(`input[name="${question.id}"]`)
            .forEach((input) => {
              input.disabled = true;
            });
          nextBtn.style.display = "inline-block";
        };

        feedback.appendChild(revealAnswerBtn);
        feedback.appendChild(correctLine);
      }
    }

    const msgLine = document.createElement("p");
    msgLine.className = "mcq-explanation";
    msgLine.textContent = `${result.message} ${result.explanation}`;
    feedback.appendChild(msgLine);

    if (result.correct) {
      submitBtn.disabled = true;
      card.querySelectorAll(`input[name="${question.id}"]`).forEach((input) => {
        input.disabled = true;
      });
      renderConfidenceRating(card, clo.id, true, () => {
        nextBtn.style.display = "inline-block";
      });
    } else {
      nextBtn.style.display = "none";
      renderConfidenceRating(card, clo.id, false, null);
    }
  };

  nextBtn.onclick = () => {
    if (!progress.usedQuestionIds.includes(question.id)) {
      progress.usedQuestionIds.push(question.id);
    }
    const nextQuestion = pickNextQuestionForClo(clo, progress);
    progress.currentQuestionId = nextQuestion?.id ?? null;
    renderMcq();
  };

  card.appendChild(submitBtn);
  card.appendChild(nextBtn);
  card.appendChild(feedback);
  mcqContainerEl.appendChild(card);
}

function getCurrentCodeProgress() {
  const clo = getSelectedClo();
  if (!state.codeProgressByClo[clo.id]) {
    state.codeProgressByClo[clo.id] = {
      currentExerciseId: null,
      usedExerciseIds: [],
    };
  }
  return state.codeProgressByClo[clo.id];
}

function getCurrentAnalysisProgress() {
  const clo = getSelectedClo();
  if (!state.analysisProgressByClo[clo.id]) {
    state.analysisProgressByClo[clo.id] = {
      currentQuestionId: null,
      usedQuestionIds: [],
      nextDifficultyIndex: 0,
    };
  }
  return state.analysisProgressByClo[clo.id];
}

function pickNextAnalysisForClo(clo, progress) {
  if (!clo.coding_analysis || clo.coding_analysis.length === 0) {
    return null;
  }

  const DIFFICULTY_ORDER = ["easy", "medium", "hard"];

  const remaining = clo.coding_analysis.filter(
    (question) => !progress.usedQuestionIds.includes(question.id),
  );

  if (remaining.length === 0) {
    progress.usedQuestionIds = [];
    progress.nextDifficultyIndex = 0;
    return clo.coding_analysis[
      Math.floor(Math.random() * clo.coding_analysis.length)
    ];
  }

  const targetDifficulty =
    DIFFICULTY_ORDER[progress.nextDifficultyIndex % DIFFICULTY_ORDER.length];
  const sameDifficulty = remaining.filter(
    (question) => (question.difficulty || "easy") === targetDifficulty,
  );

  const candidates = sameDifficulty.length > 0 ? sameDifficulty : remaining;
  const nextQuestion =
    candidates[Math.floor(Math.random() * candidates.length)];
  progress.nextDifficultyIndex =
    (progress.nextDifficultyIndex + 1) % DIFFICULTY_ORDER.length;

  return nextQuestion;
}

function pickNextExerciseForClo(clo, progress) {
  if (!clo.coding_exercises || clo.coding_exercises.length === 0) {
    return null;
  }

  const remaining = clo.coding_exercises.filter(
    (exercise) => !progress.usedExerciseIds.includes(exercise.id),
  );

  if (remaining.length === 0) {
    progress.usedExerciseIds = [];
    return clo.coding_exercises[
      Math.floor(Math.random() * clo.coding_exercises.length)
    ];
  }

  return remaining[Math.floor(Math.random() * remaining.length)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function simplifyFunctionCodeHeader(code, functionName) {
  if (!code) {
    return code;
  }

  const exactFunctionRegex = functionName
    ? new RegExp(
        `^\\s*def\\s+${escapeRegExp(functionName)}\\s*\\(([^)]*)\\)\\s*:`,
        "m",
      )
    : null;
  const fallbackFunctionRegex =
    /^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/m;

  const exactMatch = exactFunctionRegex ? code.match(exactFunctionRegex) : null;
  const fallbackMatch = code.match(fallbackFunctionRegex);
  const match = exactMatch || fallbackMatch;

  if (!match || match.index === undefined) {
    const fallbackName = functionName || "solution";
    return `def ${fallbackName}():\n    pass`;
  }

  const lines = code.split("\n");
  const definitionLineIndex = code.slice(0, match.index).split("\n").length - 1;
  const definitionLine = lines[definitionLineIndex] || "";
  const functionIndent = definitionLine.match(/^\s*/)?.[0] || "";
  const functionIndentLength = functionIndent.length;

  const rawParams = exactMatch ? match[1] : match[2] || match[1] || "";
  const params = rawParams
    .split(",")
    .map((param) => param.trim())
    .filter((param) => param && param !== "self" && param !== "cls")
    .join(", ");

  const normalizedFunctionName =
    functionName || (exactMatch ? functionName : match[1]);

  let blockEnd = lines.length;
  for (let index = definitionLineIndex + 1; index < lines.length; index += 1) {
    const currentLine = lines[index];
    if (!currentLine.trim()) {
      continue;
    }
    const lineIndentLength = currentLine.match(/^\s*/)?.[0]?.length || 0;
    if (lineIndentLength <= functionIndentLength) {
      blockEnd = index;
      break;
    }
  }

  const bodyLines = lines.slice(definitionLineIndex + 1, blockEnd);
  const nonEmptyBodyIndents = bodyLines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0]?.length || 0)
    .filter((length) => length > functionIndentLength);

  const dedentAmount = nonEmptyBodyIndents.length
    ? Math.min(...nonEmptyBodyIndents)
    : functionIndentLength + 4;

  const dedentedBody = bodyLines
    .map((line) => {
      if (!line.trim()) {
        return "";
      }
      return line.slice(Math.min(dedentAmount, line.length));
    })
    .join("\n")
    .replace(/^\n+|\n+$/g, "");

  if (!dedentedBody.trim()) {
    return `def ${normalizedFunctionName}(${params}):\n    pass`;
  }

  const normalizedBody = dedentedBody
    .split("\n")
    .map((line) => (line ? `    ${line}` : ""))
    .join("\n");

  return `def ${normalizedFunctionName}(${params}):\n${normalizedBody}`;
}

function sanitizeExercisePrompt(prompt, functionName) {
  const source = (prompt || "").trim();
  if (!source) {
    return source;
  }

  let cleaned = source
    .replace(/class\s+solution/gi, "function")
    .replace(/solution\s+class/gi, "function")
    .replace(/\bself\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    functionName &&
    !/write a function/i.test(cleaned) &&
    !/\bfunction\b/i.test(cleaned)
  ) {
    cleaned = `Write a function ${functionName}(...). ${cleaned}`;
  }

  return cleaned;
}

function sanitizeRenderedCode(code, functionName) {
  const normalized = simplifyFunctionCodeHeader(code, functionName);
  if (!normalized) {
    const fallbackName = functionName || "solution";
    return `def ${fallbackName}():\n    pass`;
  }

  if (/^\s*class\s+/m.test(normalized) || /\bself\b/.test(normalized)) {
    const fallbackName = functionName || "solution";
    return `def ${fallbackName}():\n    pass`;
  }

  return normalized;
}

function stripTrailingPassPlaceholder(code) {
  if (!code) {
    return code;
  }

  return code.replace(/\n[ \t]*pass[ \t]*$/, "");
}

function sanitizeAllCodingExercises(data) {
  if (!data?.clos) {
    return;
  }

  data.clos.forEach((clo) => {
    (clo.coding_exercises || []).forEach((exercise) => {
      exercise.prompt = sanitizeExercisePrompt(
        exercise.prompt,
        exercise.function_name,
      );
      exercise.starter_code = sanitizeRenderedCode(
        exercise.starter_code,
        exercise.function_name,
      );
      exercise.solution_code = sanitizeRenderedCode(
        exercise.solution_code,
        exercise.function_name,
      );
    });
  });
}

function getCurrentExercise() {
  if (!state.data) {
    return null;
  }

  const clo = getSelectedClo();
  if (!clo) {
    return null;
  }

  const progress = getCurrentCodeProgress();
  if (!progress?.currentExerciseId) {
    return null;
  }

  return (clo.coding_exercises || []).find(
    (exercise) => exercise.id === progress.currentExerciseId,
  );
}

function renderExercises() {
  const clo = getSelectedClo();
  const exercises = clo.coding_exercises || [];
  if (!exercises.length) {
    codingTitleEl.textContent = "Coding Exercise";
    exercisePromptEl.textContent =
      "No coding exercises available for this CLO yet.";
    codeEditorEl.value = "";
    codeFeedbackEl.className = "feedback";
    codeFeedbackEl.textContent =
      "Please check back later for more practice tasks.";
    confidenceContainerEl.innerHTML = "";
    nextCodeEl.style.display = "none";
    codeSolutionEl.style.display = "none";
    codeSolutionEl.textContent = "";
    syncCodeEditorLayer();
    return;
  }

  const progress = getCurrentCodeProgress();
  let exercise = exercises.find(
    (item) => item.id === progress.currentExerciseId,
  );
  if (!exercise) {
    exercise = pickNextExerciseForClo(clo, progress);
    progress.currentExerciseId = exercise?.id ?? null;
  }

  if (!exercise) {
    return;
  }

  codingTitleEl.textContent = `${exercise.title} (${progress.usedExerciseIds.length + 1} of ${exercises.length})`;
  exercisePromptEl.textContent = sanitizeExercisePrompt(
    exercise.prompt,
    exercise.function_name,
  );
  const starterCode = sanitizeRenderedCode(
    exercise.starter_code,
    exercise.function_name,
  );
  codeEditorEl.value = stripTrailingPassPlaceholder(starterCode);
  codeFeedbackEl.className = "feedback";
  codeFeedbackEl.textContent =
    "Submit your code to receive guided feedback and hints.";
  confidenceContainerEl.innerHTML = "";
  nextCodeEl.style.display = "none";
  codeSolutionEl.style.display = "none";
  codeSolutionEl.textContent = "";
  syncCodeEditorLayer();
}

function showSolution(exercise) {
  const solutionCode = sanitizeRenderedCode(
    exercise.solution_code,
    exercise.function_name,
  );
  if (!solutionCode) {
    codeSolutionEl.style.display = "none";
    codeSolutionEl.textContent = "";
    return;
  }

  codeEditorEl.value = solutionCode;
  syncCodeEditorLayer();
  codeSolutionEl.style.display = "block";
  codeSolutionEl.textContent = `Suggested solution:\n\n${solutionCode}`;
}

function askToShowSolution(title, message) {
  return new Promise((resolve) => {
    answerModalTitleEl.textContent = title || "Need the answer?";
    answerModalMessageEl.textContent =
      message ||
      "You have attempted this coding exercise 5 times. Do you want to see the solution now?";
    answerModalEl.style.display = "flex";

    const onYes = () => {
      cleanup();
      resolve(true);
    };

    const onNo = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      answerModalEl.style.display = "none";
      modalYesEl.removeEventListener("click", onYes);
      modalNoEl.removeEventListener("click", onNo);
    };

    modalYesEl.addEventListener("click", onYes);
    modalNoEl.addEventListener("click", onNo);
  });
}

async function revealCodingAnalysisAnswer(cloId, questionId) {
  const response = await fetch("/api/assess/code-analysis/reveal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": state.sessionId,
    },
    body: JSON.stringify({
      clo_id: cloId,
      question_id: questionId,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    return null;
  }

  return result.answer || null;
}

function showCodingAnalysisAnswer(answerText) {
  analysisFeedbackEl
    .querySelectorAll(".analysis-answer-reveal")
    .forEach((element) => element.remove());

  const reveal = document.createElement("pre");
  reveal.className = "analysis-answer-reveal";
  reveal.textContent = `Expected output:\n${answerText}`;
  analysisFeedbackEl.appendChild(reveal);
}

submitCodeEl.addEventListener("click", async () => {
  const clo = getSelectedClo();
  const progress = getCurrentCodeProgress();
  const exercise = (clo.coding_exercises || []).find(
    (item) => item.id === progress.currentExerciseId,
  );

  if (!exercise) {
    codeFeedbackEl.className = "feedback error";
    codeFeedbackEl.textContent =
      "No active coding exercise found. Please try Next Question.";
    return;
  }

  const response = await fetch("/api/assess/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": state.sessionId,
    },
    body: JSON.stringify({
      clo_id: clo.id,
      exercise_id: exercise.id,
      code: codeEditorEl.value,
    }),
  });

  const result = await response.json();
  const success = result.passed;

  codeFeedbackEl.className = `feedback ${success ? "success" : "error"}`;
  codeFeedbackEl.innerHTML = "";
  confidenceContainerEl.innerHTML = "";

  const msgEl = document.createElement("p");
  msgEl.style.margin = "0 0 4px";
  msgEl.textContent = success
    ? `${result.message} Attempts: ${result.attempts}.`
    : result.message;
  codeFeedbackEl.appendChild(msgEl);

  if (success) {
    codeSolutionEl.style.display = "none";
    codeSolutionEl.textContent = "";
    renderConfidenceRating(confidenceContainerEl, clo.id, true, () => {
      nextCodeEl.style.display = "inline-block";
    });
  } else {
    buildHintLadder(codeFeedbackEl, result.hint);
    nextCodeEl.style.display = "none";

    if (result.attempts >= 5) {
      const alreadyRevealed = state.revealedSolutions[exercise.id] === true;
      if (!alreadyRevealed) {
        const wantsSolution = await askToShowSolution(
          "Need the answer?",
          "You have attempted this coding exercise 5 times. Do you want to see the solution now?",
        );
        if (wantsSolution) {
          state.revealedSolutions[exercise.id] = true;
          showSolution(exercise);
          nextCodeEl.style.display = "inline-block";
        }
      } else {
        showSolution(exercise);
        nextCodeEl.style.display = "inline-block";
      }
    }

    if (result.attempts >= 5 && state.revealedSolutions[exercise.id]) {
      codeFeedbackEl
        .querySelectorAll(".solution-loaded-note")
        .forEach((element) => element.remove());
      const solutionNote = document.createElement("p");
      solutionNote.className = "solution-loaded-note";
      solutionNote.style.margin = "4px 0 0";
      solutionNote.textContent = "Solution loaded in the code editor.";
      codeFeedbackEl.appendChild(solutionNote);
    }

    renderConfidenceRating(confidenceContainerEl, clo.id, false, null);
  }
});

nextCodeEl.addEventListener("click", () => {
  const clo = getSelectedClo();
  const progress = getCurrentCodeProgress();
  if (
    progress.currentExerciseId &&
    !progress.usedExerciseIds.includes(progress.currentExerciseId)
  ) {
    progress.usedExerciseIds.push(progress.currentExerciseId);
  }

  const nextExercise = pickNextExerciseForClo(clo, progress);
  progress.currentExerciseId = nextExercise?.id ?? null;
  renderExercises();
});

function renderCodingAnalysis() {
  const clo = getSelectedClo();
  const questions = clo.coding_analysis || [];

  if (!questions.length) {
    analysisTitleEl.textContent = "Coding Analysis";
    analysisPromptEl.textContent =
      "No coding analysis questions available for this CLO yet.";
    analysisSnippetEl.textContent = "";
    analysisAnswerEl.value = "";
    analysisFeedbackEl.className = "feedback";
    analysisFeedbackEl.textContent = "Please check back later for more tasks.";
    analysisConfidenceContainerEl.innerHTML = "";
    nextAnalysisEl.style.display = "none";
    return;
  }

  const progress = getCurrentAnalysisProgress();
  let question = questions.find(
    (item) => item.id === progress.currentQuestionId,
  );
  if (!question) {
    question = pickNextAnalysisForClo(clo, progress);
    progress.currentQuestionId = question?.id ?? null;
  }

  if (!question) {
    return;
  }

  const difficultyLabel = (question.difficulty || "easy").toUpperCase();
  analysisTitleEl.textContent = `${question.title} [${difficultyLabel}] (${progress.usedQuestionIds.length + 1} of ${questions.length})`;
  analysisPromptEl.textContent = question.prompt;
  analysisSnippetEl.textContent = question.snippet;
  analysisAnswerEl.value = "";
  analysisAnswerEl.readOnly = false;
  submitAnalysisEl.disabled = false;
  analysisFeedbackEl.className = "feedback";
  analysisFeedbackEl.textContent =
    "Read the code, then write what you expect the output to be.";
  analysisConfidenceContainerEl.innerHTML = "";
  nextAnalysisEl.style.display = "none";
}

submitAnalysisEl.addEventListener("click", async () => {
  const clo = getSelectedClo();
  const progress = getCurrentAnalysisProgress();
  const question = (clo.coding_analysis || []).find(
    (item) => item.id === progress.currentQuestionId,
  );

  if (!question) {
    analysisFeedbackEl.className = "feedback error";
    analysisFeedbackEl.textContent =
      "No active coding analysis question found. Please try Next Question.";
    return;
  }

  if (!analysisAnswerEl.value.trim()) {
    analysisFeedbackEl.className = "feedback error";
    analysisFeedbackEl.textContent = "Please enter your expected output.";
    return;
  }

  const response = await fetch("/api/assess/code-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": state.sessionId,
    },
    body: JSON.stringify({
      clo_id: clo.id,
      question_id: question.id,
      answer: analysisAnswerEl.value,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    analysisFeedbackEl.className = "feedback error";
    analysisFeedbackEl.textContent =
      result.error || "Could not evaluate your answer right now.";
    return;
  }

  const success = result.correct;
  analysisFeedbackEl.className = `feedback ${success ? "success" : "error"}`;
  analysisFeedbackEl.innerHTML = "";
  analysisConfidenceContainerEl.innerHTML = "";

  const messageEl = document.createElement("p");
  messageEl.style.margin = "0";
  messageEl.textContent = success
    ? `${result.message} Attempts: ${result.attempts}.`
    : result.message;
  analysisFeedbackEl.appendChild(messageEl);

  if (!success) {
    buildHintLadder(analysisFeedbackEl, result.hint);
    nextAnalysisEl.style.display = "none";

    if (result.attempts >= 5) {
      const revealKey = `analysis:${question.id}`;
      const alreadyRevealed = state.revealedSolutions[revealKey] === true;

      if (!alreadyRevealed) {
        const wantsAnswer = await askToShowSolution(
          "Need the answer?",
          "You have attempted this coding analysis question 5 times. Do you want to see the expected output now?",
        );
        if (wantsAnswer) {
          const answerText = await revealCodingAnalysisAnswer(
            clo.id,
            question.id,
          );
          if (answerText) {
            state.revealedSolutions[revealKey] = true;
            showCodingAnalysisAnswer(answerText);
            nextAnalysisEl.style.display = "inline-block";
            analysisAnswerEl.readOnly = true;
            submitAnalysisEl.disabled = true;
          }
        }
      } else {
        const answerText = await revealCodingAnalysisAnswer(
          clo.id,
          question.id,
        );
        if (answerText) {
          showCodingAnalysisAnswer(answerText);
          nextAnalysisEl.style.display = "inline-block";
          analysisAnswerEl.readOnly = true;
          submitAnalysisEl.disabled = true;
        }
      }
    }

    renderConfidenceRating(analysisConfidenceContainerEl, clo.id, false, null);
    return;
  }

  nextAnalysisEl.style.display = "inline-block";
  analysisAnswerEl.readOnly = true;
  submitAnalysisEl.disabled = true;

  renderConfidenceRating(analysisConfidenceContainerEl, clo.id, true, () => {
    nextAnalysisEl.style.display = "inline-block";
  });
});

nextAnalysisEl.addEventListener("click", () => {
  const clo = getSelectedClo();
  const progress = getCurrentAnalysisProgress();
  if (
    progress.currentQuestionId &&
    !progress.usedQuestionIds.includes(progress.currentQuestionId)
  ) {
    progress.usedQuestionIds.push(progress.currentQuestionId);
  }

  const nextQuestion = pickNextAnalysisForClo(clo, progress);
  progress.currentQuestionId = nextQuestion?.id ?? null;
  renderCodingAnalysis();
});

function renderAll() {
  renderCloButtons();
  renderSlides();
  renderSummary();
  renderVideos();
  renderMcq();
  renderExercises();
  renderCodingAnalysis();
}

tabMcqEl.addEventListener("click", () => setActiveTab("mcq"));
tabCodeEl.addEventListener("click", () => setActiveTab("code"));
tabAnalysisEl.addEventListener("click", () => setActiveTab("analysis"));

async function initialize() {
  const response = await fetch("/api/clos");
  state.data = await response.json();
  state.masteryByClo = loadMasteryProgress();
  sanitizeAllCodingExercises(state.data);
  renderAll();
  setActiveTab(null);
  syncCodeEditorLayer();
}

initialize();
