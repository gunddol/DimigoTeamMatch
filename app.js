// URL로 불러오기만 지원합니다. (샘플/업로드 기능 제거)

const state = {
  students: [],
  teams: [],
  unmatched: [],
  lastSourceLabel: "",
};

const undecidedKeywords = ["아직 모르겠음", "모르겠", "undecided", "unknown", "미정"];

const matchRuntime = {
  token: 0,
  canceled: false,
  fastForward: false,
};

const refs = {
  sheetUrl: document.getElementById("sheetUrl"),
  loadSheetBtn: document.getElementById("loadSheetBtn"),
  statusBox: document.getElementById("statusBox"),
  startMatchBtn: document.getElementById("startMatchBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  studentsTableBody: document.getElementById("studentsTableBody"),
  totalStudents: document.getElementById("totalStudents"),
  designCount: document.getElementById("designCount"),
  engineeringCount: document.getElementById("engineeringCount"),
  anyCount: document.getElementById("anyCount"),
  undecidedCount: document.getElementById("undecidedCount"),
  teamsContainer: document.getElementById("teamsContainer"),
  resultMeta: document.getElementById("resultMeta"),
  unmatchedContainer: document.getElementById("unmatchedContainer"),
  matchScreen: document.getElementById("matchScreen"),
  matchTitle: document.getElementById("matchTitle"),
  matchSubtitle: document.getElementById("matchSubtitle"),
  matchProgressBar: document.getElementById("matchProgressBar"),
  matchTeams: document.getElementById("matchTeams"),
  matchRunBtn: document.getElementById("matchRunBtn"),
  matchSkipBtn: document.getElementById("matchSkipBtn"),
  matchCloseBtn: document.getElementById("matchCloseBtn"),
};

function setStatus(message, type = "info") {
  refs.statusBox.textContent = message;
  refs.statusBox.style.borderColor =
    type === "error"
      ? "rgba(220,38,38,.22)"
      : type === "success"
      ? "rgba(22,163,74,.22)"
      : "rgba(15,23,42,.12)";
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function setMatchScreenOpen(isOpen) {
  if (!refs.matchScreen) return;

  if (isOpen) {
    refs.matchScreen.hidden = false;
    document.body.classList.add("match-screen-open");
  } else {
    refs.matchScreen.hidden = true;
    document.body.classList.remove("match-screen-open");
  }
}

function isMatchScreenOpen() {
  return Boolean(refs.matchScreen && !refs.matchScreen.hidden);
}

function resetMatchScreenUi() {
  if (!refs.matchTeams || !refs.matchProgressBar) return;
  refs.matchTeams.innerHTML = "";
  refs.matchProgressBar.style.width = "0%";
  if (refs.matchSubtitle) refs.matchSubtitle.textContent = "준비되면 시작을 눌러주세요.";
  if (refs.matchRunBtn) {
    refs.matchRunBtn.disabled = !state.students.length;
    refs.matchRunBtn.textContent = "시작";
  }
  if (refs.matchSkipBtn) {
    refs.matchSkipBtn.hidden = true;
    refs.matchSkipBtn.disabled = false;
  }
}

function setStartMatchEnabled(enabled) {
  if (!refs.startMatchBtn) return;
  refs.startMatchBtn.disabled = !enabled;
}

function openMatchScreen() {
  if (!state.students.length) {
    setStatus("먼저 학생 데이터를 불러와 주세요.", "error");
    return;
  }

  matchRuntime.token += 1;
  matchRuntime.canceled = false;
  matchRuntime.fastForward = false;

  setMatchScreenOpen(true);
  if (refs.matchTitle) refs.matchTitle.textContent = "팀을 하나씩 뽑아볼게요";
  resetMatchScreenUi();
}

function closeMatchScreen() {
  matchRuntime.token += 1;
  matchRuntime.canceled = true;
  matchRuntime.fastForward = false;
  setMatchScreenOpen(false);
}

function cancelActiveMatchReveal() {
  matchRuntime.token += 1;
  matchRuntime.canceled = true;
  matchRuntime.fastForward = false;
}

function onMatchBackdropClick(event) {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.matchDismiss === "true") closeMatchScreen();
}

async function revealTeamsSequentially(teams, token) {
  if (!refs.matchTeams || !refs.matchProgressBar || !refs.matchSubtitle) return;

  refs.matchTeams.innerHTML = "";
  const total = teams.length;

  for (let index = 0; index < teams.length; index += 1) {
    if (token !== matchRuntime.token) return;
    if (matchRuntime.canceled) return;

    const team = teams[index];
    const article = createTeamArticleElement(team, index, { variant: matchRuntime.fastForward ? "instant" : "showy" });
    refs.matchTeams.appendChild(article);
    // 방금 생성된 카드가 오버레이 중앙에 오도록 스크롤(부드럽게)
    article.scrollIntoView({
      behavior: matchRuntime.fastForward ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });

    const progress = total ? Math.round(((index + 1) / total) * 100) : 100;
    refs.matchProgressBar.style.width = `${progress}%`;
    refs.matchSubtitle.textContent = `Team ${index + 1} / ${total} 생성 중…`;

    const stepMs = matchRuntime.fastForward ? 0 : 860;
    if (stepMs > 0) await wait(stepMs);
  }

  if (token !== matchRuntime.token) return;
  if (matchRuntime.canceled) return;

  refs.matchSubtitle.textContent = total ? `완료! 총 ${total}개 팀이 만들어졌어요.` : "만들 팀이 없습니다.";
  if (refs.matchSkipBtn) refs.matchSkipBtn.hidden = true;
  if (refs.matchRunBtn) {
    refs.matchRunBtn.disabled = false;
    refs.matchRunBtn.textContent = "한 번 더";
  }
}

async function startMatchReveal() {
  if (!state.students.length) return;

  const token = (matchRuntime.token += 1);
  matchRuntime.canceled = false;
  matchRuntime.fastForward = false;

  if (refs.matchRunBtn) refs.matchRunBtn.disabled = true;
  if (refs.matchSkipBtn) {
    refs.matchSkipBtn.hidden = false;
    refs.matchSkipBtn.disabled = false;
  }

  buildMatchResult();
  renderTeams();
  setStatus(`매칭 완료: ${state.teams.length}개 팀 생성`, "success");

  await revealTeamsSequentially(state.teams, token);
}

function skipMatchReveal() {
  matchRuntime.fastForward = true;
  if (refs.matchSkipBtn) refs.matchSkipBtn.disabled = true;
}

function onGlobalKeyDown(event) {
  if (event.key !== "Escape") return;
  if (!isMatchScreenOpen()) return;
  closeMatchScreen();
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()\[\]{}]/g, "");
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (cells[index] || "").trim();
    });
    return obj;
  });
}

function headerValue(row, aliases) {
  const keys = Object.keys(row);
  const normalizedMap = new Map(keys.map((key) => [normalizeHeader(key), key]));
  for (const alias of aliases) {
    const found = normalizedMap.get(normalizeHeader(alias));
    if (found) return row[found];
  }
  return "";
}

function canonicalizeDepartment(value) {
  const input = String(value || "").trim();
  const lowered = input.toLowerCase();
  if (!input) return "미입력";
  if (["이비즈니스", "e비즈니스", "ebusiness", "e-business", "비즈니스"].some((token) => lowered.includes(token.toLowerCase()))) return "이비즈니스과";
  if (["디지털콘텐츠", "디콘", "digitalcontent", "content"].some((token) => lowered.includes(token.toLowerCase()))) return "디지털콘텐츠과";
  if (["해킹방어", "해방", "hacking", "security", "보안"].some((token) => lowered.includes(token.toLowerCase()))) return "해킹방어과";
  if (["웹프로그래밍", "웹프", "webprogramming", "web", "프로그래밍"].some((token) => lowered.includes(token.toLowerCase()))) return "웹프로그래밍과";
  return input;
}

function canonicalizeRole(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return "any";
  if (input.includes("상관") || input.includes("둘다") || input.includes("둘 다") || input.includes("any") || input.includes("무관")) return "any";
  if (input.includes("product designer") || input.includes("pd")) return "design";
  if (input.includes("release engineer") || input.includes("re")) return "engineering";
  if (input.includes("design") || input.includes("디자인") || input.includes("기획") || input.includes("프로덕트")) return "design";
  if (input.includes("engineering") || input.includes("engineer") || input.includes("엔지니어") || input.includes("개발") || input.includes("릴리즈")) return "engineering";
  return "any";
}

function roleLabel(role) {
  if (role === "design") return "Design";
  if (role === "engineering") return "Engineering";
  return "상관없음";
}

function projectRoleLabel(role) {
  if (role === "product") return "Product Designer";
  if (role === "release") return "Release Engineer";
  return "역할 협의 필요";
}

function canonicalizeTopic(value) {
  const input = String(value || "").trim();
  return input || "아직 모르겠음";
}

function isUndecidedTopic(topic) {
  const value = String(topic || "").trim().toLowerCase();
  return undecidedKeywords.some((keyword) => value.includes(keyword.toLowerCase()));
}

function normalizeStudents(rows) {
  return rows
    .map((row, index) => {
      const name = headerValue(row, ["name", "이름", "학생이름", "studentname", "이름을 입력해주세요.", "이름을 입력해주세요"]);
      const department = headerValue(row, [
        "department",
        "major",
        "학과",
        "과",
        "전공",
        "track",
        "계열",
        "과를 선택해주세요.",
        "과를 선택해주세요",
      ]);
      const role = headerValue(row, [
        "role_preference",
        "role",
        "희망역할",
        "역할",
        "선호역할",
        "희망하는 역할을 선택해주세요.",
        "희망하는 역할을 선택해주세요",
      ]);
      const topic = headerValue(row, [
        "topic_preference",
        "topic",
        "희망주제",
        "주제",
        "만들고싶은주제",
        "만들고 싶은 주제",
        "제작주제",
        "만들고 싶은 사이트의 주제를 선택해주세요.",
        "만들고 싶은 사이트의 주제를 선택해주세요",
      ]);

      return {
        id: `${String(name || "학생").trim()}-${index + 1}`,
        name: String(name || `학생${index + 1}`).trim(),
        department: canonicalizeDepartment(department),
        role: canonicalizeRole(role),
        topic: canonicalizeTopic(topic),
      };
    })
    .filter((student) => student.name);
}

function computeCompatibility(a, b) {
  // 중요도 위계 고정: 주제 > 역할 > 학과
  // 점수는 '가중치 조절' 대신 우선순위가 깨지지 않도록 큰 자릿수로 합산합니다.
  let topicTier = 0;
  let roleTier = 0;
  let departmentTier = 0;
  const reasons = [];

  const sameSpecificTopic =
    a.topic === b.topic && !isUndecidedTopic(a.topic) && !isUndecidedTopic(b.topic);
  const bothUndecided = isUndecidedTopic(a.topic) && isUndecidedTopic(b.topic);
  const oneUndecided = isUndecidedTopic(a.topic) || isUndecidedTopic(b.topic);

  if (sameSpecificTopic) {
    topicTier = 3;
    reasons.push(`주제 일치(${a.topic})`);
  } else if (bothUndecided) {
    topicTier = 1;
    reasons.push("둘 다 주제 미정");
  } else if (oneUndecided) {
    topicTier = 0;
    reasons.push("주제 미정 포함");
  } else {
    topicTier = -1;
    reasons.push("주제 불일치");
  }

  const complementaryRoles =
    (a.role === "design" && b.role === "engineering") ||
    (a.role === "engineering" && b.role === "design");
  const hasFlexibleRole = a.role === "any" || b.role === "any";

  if (complementaryRoles) {
    roleTier = 2;
    reasons.push("역할 보완(Design + Engineering)");
  } else if (hasFlexibleRole) {
    roleTier = 1;
    reasons.push("역할 유연(상관없음 포함)");
  } else {
    roleTier = 0;
    reasons.push(`역할 동일(${roleLabel(a.role)})`);
  }

  if (a.department === b.department) {
    departmentTier = 1;
    reasons.push(`같은 학과(${a.department})`);
  } else {
    departmentTier = 0;
    reasons.push("학과 다름");
  }

  const score = topicTier * 10000 + roleTier * 100 + departmentTier;
  return { score, reasons };
}

function createGreedyPairs(students) {
  const candidates = [];
  for (let i = 0; i < students.length; i += 1) {
    for (let j = i + 1; j < students.length; j += 1) {
      const detail = computeCompatibility(students[i], students[j]);
      candidates.push({
        ids: [students[i].id, students[j].id],
        students: [students[i], students[j]],
        score: detail.score,
        reasons: detail.reasons,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.students[0].name.localeCompare(b.students[0].name, "ko"));

  const used = new Set();
  const teams = [];

  for (const pair of candidates) {
    const [firstId, secondId] = pair.ids;
    if (!used.has(firstId) && !used.has(secondId)) {
      used.add(firstId);
      used.add(secondId);
      teams.push(pair);
    }
  }

  const unmatched = students.filter((student) => !used.has(student.id));
  return { teams, unmatched };
}

function optimizeTeams(teams) {
  const result = [...teams];
  let improved = true;
  let loops = 0;

  while (improved && loops < 8) {
    improved = false;
    loops += 1;

    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const [a, b] = result[i].students;
        const [c, d] = result[j].students;

        const currentScore =
          computeCompatibility(a, b).score + computeCompatibility(c, d).score;

        const option1ab = computeCompatibility(a, c);
        const option1cd = computeCompatibility(b, d);
        const option1Score = option1ab.score + option1cd.score;

        const option2ab = computeCompatibility(a, d);
        const option2cd = computeCompatibility(b, c);
        const option2Score = option2ab.score + option2cd.score;

        if (option1Score > currentScore && option1Score >= option2Score) {
          result[i] = {
            ids: [a.id, c.id],
            students: [a, c],
            score: option1ab.score,
            reasons: option1ab.reasons,
          };
          result[j] = {
            ids: [b.id, d.id],
            students: [b, d],
            score: option1cd.score,
            reasons: option1cd.reasons,
          };
          improved = true;
        } else if (option2Score > currentScore) {
          result[i] = {
            ids: [a.id, d.id],
            students: [a, d],
            score: option2ab.score,
            reasons: option2ab.reasons,
          };
          result[j] = {
            ids: [b.id, c.id],
            students: [b, c],
            score: option2cd.score,
            reasons: option2cd.reasons,
          };
          improved = true;
        }
      }
    }
  }

  return result.sort((a, b) => b.score - a.score);
}

function recommendedRoles(a, b) {
  if (a.role === "design" && b.role === "engineering") return ["product", "release"];
  if (a.role === "engineering" && b.role === "design") return ["release", "product"];
  if (a.role === "any" && b.role === "design") return ["release", "product"];
  if (a.role === "any" && b.role === "engineering") return ["product", "release"];
  if (a.role === "design" && b.role === "any") return ["product", "release"];
  if (a.role === "engineering" && b.role === "any") return ["release", "product"];
  if (a.role === "any" && b.role === "any") return ["product", "release"];
  if (a.role === "design" && b.role === "design") return ["product", "release"];
  if (a.role === "engineering" && b.role === "engineering") return ["release", "product"];
  return ["product", "release"];
}

function buildMatchResult() {
  const { teams, unmatched } = createGreedyPairs(state.students);
  const optimizedTeams = optimizeTeams(teams);
  state.teams = optimizedTeams;
  state.unmatched = unmatched;
}

function departmentLabel(department) {
  return department || "미입력";
}

function renderStudents() {
  refs.studentsTableBody.innerHTML = "";

  if (!state.students.length) {
    refs.studentsTableBody.innerHTML = '<tr><td colspan="4">불러온 학생 데이터가 없습니다.</td></tr>';
    refs.totalStudents.textContent = "0";
    refs.designCount.textContent = "0";
    refs.engineeringCount.textContent = "0";
    refs.anyCount.textContent = "0";
    refs.undecidedCount.textContent = "0";
    return;
  }

  const designCount = state.students.filter((student) => student.role === "design").length;
  const engineeringCount = state.students.filter((student) => student.role === "engineering").length;
  const anyCount = state.students.filter((student) => student.role === "any").length;
  const undecidedCount = state.students.filter((student) => isUndecidedTopic(student.topic)).length;

  refs.totalStudents.textContent = String(state.students.length);
  refs.designCount.textContent = String(designCount);
  refs.engineeringCount.textContent = String(engineeringCount);
  refs.anyCount.textContent = String(anyCount);
  refs.undecidedCount.textContent = String(undecidedCount);

  state.students.forEach((student) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(student.name)}</td>
      <td>${escapeHtml(departmentLabel(student.department))}</td>
      <td>${escapeHtml(roleLabel(student.role))}</td>
      <td>${escapeHtml(student.topic)}</td>
    `;
    refs.studentsTableBody.appendChild(tr);
  });
}

function createTeamArticleElement(team, index, options = {}) {
  const variant = options.variant || "plain";
  const [memberA, memberB] = team.students;

  const article = document.createElement("article");
  const classes = ["team-card"];
  if (variant === "plain") classes.push("team-card--plain");
  if (variant === "showy") classes.push("match-team");
  if (variant === "instant") classes.push("match-team", "match-team--instant");
  article.className = classes.join(" ");

  article.innerHTML = `
    <div class="team-no">Team ${index + 1}</div>
    <div class="member-grid">
      ${renderMember(memberA)}
      ${renderMember(memberB)}
    </div>
  `;

  return article;
}

function renderTeams() {
  refs.teamsContainer.innerHTML = "";

  if (!state.teams.length) {
    refs.resultMeta.className = "result-meta empty";
    refs.resultMeta.textContent = "아직 팀이 생성되지 않았습니다. 데이터를 불러온 뒤 팀 매칭을 시작해 주세요.";
    refs.downloadBtn.disabled = true;
  } else {
    refs.resultMeta.className = "result-meta";
    refs.resultMeta.innerHTML = `총 <strong>${state.teams.length}개 팀</strong>이 생성되었습니다. 데이터 출처: <strong>${escapeHtml(
      state.lastSourceLabel || "미정"
    )}</strong>`;
    refs.downloadBtn.disabled = false;
  }

  state.teams.forEach((team, index) => {
    refs.teamsContainer.appendChild(createTeamArticleElement(team, index, { variant: "plain" }));
  });

  if (!state.unmatched.length) {
    refs.unmatchedContainer.className = "unmatched-container empty";
    refs.unmatchedContainer.textContent = "현재 대기 학생이 없습니다.";
  } else {
    refs.unmatchedContainer.className = "unmatched-container";
    refs.unmatchedContainer.innerHTML = "";
    state.unmatched.forEach((student) => {
      const div = document.createElement("div");
      div.className = "unmatched-item";
      div.innerHTML = `
        <strong>
          <span class="member-dept">${escapeHtml(departmentLabel(student.department))}</span><br/>
          <span class="member-name">${escapeHtml(student.name)}</span>
        </strong>
      `;
      refs.unmatchedContainer.appendChild(div);
    });
  }
}

function renderMember(student) {
  return `
    <div class="member-card match-person">
      <strong>
        <span class="member-dept">${escapeHtml(departmentLabel(student.department))}</span><br/>
        <span class="member-name">${escapeHtml(student.name)}</span>
      </strong>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function transformGoogleSheetUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  if (value.includes("output=csv") || value.includes("format=csv")) return value;

  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return value;

  const sheetId = match[1];
  let gid = "0";

  try {
    const parsedUrl = new URL(value);
    gid = parsedUrl.searchParams.get("gid") || gid;
  } catch (error) {
    const gidMatch = value.match(/[?&]gid=([0-9]+)/);
    gid = gidMatch ? gidMatch[1] : gid;
  }

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function extractSheetIdAndGid(url) {
  const value = String(url || "").trim();
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const sheetId = match[1];
  let gid = "0";

  try {
    const parsedUrl = new URL(value);
    gid = parsedUrl.searchParams.get("gid") || gid;
  } catch (error) {
    const gidMatch = value.match(/[?&]gid=([0-9]+)/);
    gid = gidMatch ? gidMatch[1] : gid;
  }

  return { sheetId, gid };
}

function gvizCellValue(cell) {
  if (!cell) return "";
  if (cell.f != null) return String(cell.f);
  if (cell.v == null) return "";
  return String(cell.v);
}

function gvizToRowObjects(gvizJson) {
  const table = gvizJson?.table;
  if (!table?.cols?.length || !table?.rows?.length) return [];
  const headers = table.cols.map((col, idx) => String(col?.label || `col_${idx}`));
  return table.rows.map((row) => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = gvizCellValue(row?.c?.[idx]);
    });
    return obj;
  });
}

async function loadGoogleSheetViaJsonp(inputUrl) {
  const info = extractSheetIdAndGid(inputUrl);
  if (!info) throw new Error("INVALID_SHEET_URL");

  const callbackName = `__gviz_cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const src = `https://docs.google.com/spreadsheets/d/${info.sheetId}/gviz/tq?gid=${encodeURIComponent(
    info.gid
  )}&tqx=${encodeURIComponent(`out:json;responseHandler:${callbackName}`)}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("JSONP_TIMEOUT"));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      try {
        delete window[callbackName];
      } catch (error) {
        window[callbackName] = undefined;
      }
      script.remove();
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("JSONP_LOAD_FAILED"));
    };

    window[callbackName] = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(gvizToRowObjects(data));
    };

    document.head.appendChild(script);
  });
}

async function loadStudentsFromCsvText(csvText, sourceLabel) {
  setStatus("데이터를 불러오는 중입니다...");
  if (isMatchScreenOpen()) closeMatchScreen();
  else cancelActiveMatchReveal();
  const rows = parseCsv(csvText);
  const normalized = normalizeStudents(rows);

  if (!normalized.length) {
    throw new Error("CSV에서 유효한 학생 데이터를 찾지 못했습니다.");
  }

  state.students = normalized;
  state.teams = [];
  state.unmatched = [];
  state.lastSourceLabel = sourceLabel;
  renderStudents();
  renderTeams();
  setStartMatchEnabled(true);
  setStatus(`${normalized.length}명의 학생 데이터를 불러왔습니다. 이제 팀 매칭을 시작해 주세요.`, "success");
}

async function loadSheetUrl() {
  const inputUrl = refs.sheetUrl.value.trim();
  if (!inputUrl) {
    setStatus("구글 스프레드시트 URL을 먼저 입력해 주세요.", "error");
    return;
  }

  const fetchUrl = transformGoogleSheetUrl(inputUrl);
  setStatus("시트 데이터를 불러오는 중입니다...");

  try {
    // 서버 없이도 동작하도록 JSONP(gviz) 우선 시도 (CORS 영향 없음)
    const gvizRows = await loadGoogleSheetViaJsonp(inputUrl);
    const normalized = normalizeStudents(gvizRows);
    if (!normalized.length) throw new Error("EMPTY_ROWS");

    state.students = normalized;
    state.teams = [];
    state.unmatched = [];
    state.lastSourceLabel = "Google Sheets";
    renderStudents();
    renderTeams();
    setStartMatchEnabled(true);
    setStatus(`${normalized.length}명의 학생 데이터를 불러왔습니다. 이제 팀 매칭을 시작해 주세요.`, "success");
  } catch (error) {
    console.error(error);

    // JSONP가 막혔을 때(권한/네트워크 이슈 등) 서버가 있다면 fetch도 시도
    try {
      let response = null;
      try {
        response = await fetch(fetchUrl);
      } catch (inner) {
        response = null;
      }

      if (!response || !response.ok) {
        const proxyUrl = `/api/sheet?url=${encodeURIComponent(fetchUrl)}`;
        response = await fetch(proxyUrl);
      }

      if (response && response.ok) {
        const csv = await response.text();
        await loadStudentsFromCsvText(csv, "Google Sheets");
        return;
      }
    } catch (innerError) {
      console.error(innerError);
    }

    setStatus("시트 데이터를 불러오지 못했습니다. 시트를 '링크 있는 모든 사용자 보기' 또는 '웹에 게시'로 설정했는지 확인해 주세요.", "error");
  }
}

function downloadTeamsCsv() {
  if (!state.teams.length) return;

  const lines = [
    [
      "team_no",
      "student_a",
      "student_b",
      "department_a",
      "department_b",
      "role_preference_a",
      "role_preference_b",
      "assigned_role_a",
      "assigned_role_b",
      "topic_a",
      "topic_b",
      "score",
    ].join(",")
  ];

  state.teams.forEach((team, index) => {
    const [a, b] = team.students;
    const [roleA, roleB] = recommendedRoles(a, b);
    lines.push(
      [
        index + 1,
        csvEscape(a.name),
        csvEscape(b.name),
        csvEscape(a.department),
        csvEscape(b.department),
        csvEscape(roleLabel(a.role)),
        csvEscape(roleLabel(b.role)),
        csvEscape(projectRoleLabel(roleA)),
        csvEscape(projectRoleLabel(roleB)),
        csvEscape(a.topic),
        csvEscape(b.topic),
        team.score,
      ].join(",")
    );
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "team-matching-result.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function wireEvents() {
  document.addEventListener("keydown", onGlobalKeyDown);

  refs.loadSheetBtn.addEventListener("click", () => {
    loadSheetUrl();
  });

  if (refs.startMatchBtn) {
    refs.startMatchBtn.addEventListener("click", () => {
      openMatchScreen();
    });
  }

  if (refs.matchRunBtn) {
    refs.matchRunBtn.addEventListener("click", () => {
      startMatchReveal();
    });
  }

  if (refs.matchSkipBtn) {
    refs.matchSkipBtn.addEventListener("click", () => {
      skipMatchReveal();
    });
  }

  if (refs.matchCloseBtn) {
    refs.matchCloseBtn.addEventListener("click", () => {
      closeMatchScreen();
    });
  }

  if (refs.matchScreen) {
    refs.matchScreen.addEventListener("click", onMatchBackdropClick);
  }

  refs.downloadBtn.addEventListener("click", downloadTeamsCsv);
}

wireEvents();
renderStudents();
renderTeams();
setStartMatchEnabled(false);
