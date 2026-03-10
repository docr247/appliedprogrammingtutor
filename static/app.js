const state = {
  data: null,
  selectedCloIndex: 0,
  selectedVideoWeek: "all",
  sessionId: crypto.randomUUID(),
  activeAssessmentTab: null,
  mcqProgressByClo: {},
  codeProgressByClo: {},
  revealedSolutions: {},
};

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
const modalYesEl = document.getElementById("modal-yes");
const modalNoEl = document.getElementById("modal-no");

const tabMcqEl = document.getElementById("tab-mcq");
const tabCodeEl = document.getElementById("tab-code");
const panelMcqEl = document.getElementById("panel-mcq");
const panelCodeEl = document.getElementById("panel-code");

const submitCodeEl = document.getElementById("submit-code");

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
  tabMcqEl.classList.toggle("active", isMcq);
  tabCodeEl.classList.toggle("active", isCode);
  panelMcqEl.classList.toggle("active", isMcq);
  panelCodeEl.classList.toggle("active", isCode);

  if (isMcq) {
    renderMcq();
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
    feedback.style.display = "block";
    feedback.className = `feedback ${result.correct ? "success" : "error"}`;
    feedback.textContent = `${result.message} ${result.explanation}`;
    submitBtn.disabled = true;
    card.querySelectorAll(`input[name="${question.id}"]`).forEach((input) => {
      input.disabled = true;
    });
    nextBtn.style.display = "inline-block";
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

  const normalizedBody = bodyLines
    .map((line) => {
      if (!line.trim()) {
        return "";
      }
      return line.slice(Math.min(dedentAmount, line.length));
    })
    .join("\n");

  if (!normalizedBody.trim()) {
    return `def ${normalizedFunctionName}(${params}):\n    pass`;
  }

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

function askToShowSolution() {
  return new Promise((resolve) => {
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

  if (success) {
    codeFeedbackEl.textContent = `${result.message} Attempts: ${result.attempts}.`;
    nextCodeEl.style.display = "inline-block";
    codeSolutionEl.style.display = "none";
    codeSolutionEl.textContent = "";
  } else {
    codeFeedbackEl.textContent = `${result.message} Hint: ${result.hint} (Attempt ${result.attempts})`;
    nextCodeEl.style.display = "none";

    if (result.attempts >= 5) {
      const alreadyRevealed = state.revealedSolutions[exercise.id] === true;
      if (!alreadyRevealed) {
        const wantsSolution = await askToShowSolution();
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

    if (result.attempts >= 5 && !state.revealedSolutions[exercise.id]) {
      codeSolutionEl.style.display = "none";
      codeSolutionEl.textContent = "";
    }

    if (result.attempts >= 5 && state.revealedSolutions[exercise.id]) {
      codeFeedbackEl.textContent = `${result.message} Hint: ${result.hint} (Attempt ${result.attempts}) Solution loaded in the code editor.`;
    }
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

function renderAll() {
  renderCloButtons();
  renderSlides();
  renderSummary();
  renderVideos();
  renderMcq();
  renderExercises();
}

tabMcqEl.addEventListener("click", () => setActiveTab("mcq"));
tabCodeEl.addEventListener("click", () => setActiveTab("code"));

async function initialize() {
  const response = await fetch("/api/clos");
  state.data = await response.json();
  sanitizeAllCodingExercises(state.data);
  renderAll();
  setActiveTab(null);
  syncCodeEditorLayer();
}

initialize();
