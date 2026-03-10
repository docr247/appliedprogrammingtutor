const state = {
  data: null,
  selectedCloIndex: 0,
  selectedExerciseIndex: 0,
  selectedVideoWeek: "all",
  sessionId: crypto.randomUUID(),
  activeAssessmentTab: null,
  mcqProgressByClo: {},
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

const exerciseSelectEl = document.getElementById("exercise-select");
const exercisePromptEl = document.getElementById("exercise-prompt");
const codeEditorEl = document.getElementById("code-editor");
const codeFeedbackEl = document.getElementById("code-feedback");

const tabMcqEl = document.getElementById("tab-mcq");
const tabCodeEl = document.getElementById("tab-code");
const panelMcqEl = document.getElementById("panel-mcq");
const panelCodeEl = document.getElementById("panel-code");

const submitCodeEl = document.getElementById("submit-code");

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
      state.selectedExerciseIndex = 0;
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

function renderExercises() {
  const clo = getSelectedClo();
  const exercises = clo.coding_exercises;

  exerciseSelectEl.innerHTML = "";
  exercises.forEach((exercise, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = exercise.title;
    exerciseSelectEl.appendChild(option);
  });

  exerciseSelectEl.value = String(state.selectedExerciseIndex);

  const exercise = exercises[state.selectedExerciseIndex];
  exercisePromptEl.textContent = exercise.prompt;
  codeEditorEl.value = exercise.starter_code;
  codeFeedbackEl.className = "feedback";
  codeFeedbackEl.textContent =
    "Submit your code to receive guided feedback and hints.";
}

exerciseSelectEl.addEventListener("change", () => {
  state.selectedExerciseIndex = Number(exerciseSelectEl.value);
  const clo = getSelectedClo();
  const exercise = clo.coding_exercises[state.selectedExerciseIndex];
  exercisePromptEl.textContent = exercise.prompt;
  codeEditorEl.value = exercise.starter_code;
  codeFeedbackEl.className = "feedback";
  codeFeedbackEl.textContent = "Switched exercise. Try solving this one.";
});

submitCodeEl.addEventListener("click", async () => {
  const clo = getSelectedClo();
  const exercise = clo.coding_exercises[state.selectedExerciseIndex];

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
  } else {
    codeFeedbackEl.textContent = `${result.message} Hint: ${result.hint} (Attempt ${result.attempts})`;
  }
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
  renderAll();
  setActiveTab(null);
}

initialize();
