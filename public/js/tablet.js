      const $ = (id) => document.getElementById(id);
      const pts = (q) => PT[q.d];
      function types() {
        return [...new Set(Qs.map((q) => q.t))];
      }
      function newContestantId() {
        return `player-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }
      function activeRound() {
        return G?.mode === "rounds" && Array.isArray(G.rounds)
          ? G.rounds.find((round) => round.id === G.activeRoundId) || null
          : null;
      }
      function roundScore(round, contestantId) {
        return round?.players?.find((player) => player.id === contestantId)
          ?.score || 0;
      }
      function activeContestants() {
        return G?.mode === "rounds"
          ? activeRound()?.players || []
          : G?.cs || [];
      }
      function contestantScore(contestant) {
        return G?.mode === "rounds" ? contestant.score || 0 : contestant.s;
      }
      let questionSearch = "",
        questionDifficulty = "all",
        questionKind = "all",
        duplicateQuestionsOnly = false;
      function render() {
        if (!G) return;
        const searchHasFocus = $("questionSearch") === document.activeElement,
          searchCursor = searchHasFocus ? $("questionSearch").selectionStart : null;
        // صحّح العدادات القديمة/غير المكتملة قبل إنشاء HTML، حتى لا تظهر
        // قيم غير صالحة أو يتعطل العرض عند تحميل حالة لعبة قديمة.
        if (!G.stats || typeof G.stats !== "object")
          G.stats = { correct: 0, wrong: 0, deductedPoints: 0 };
        const hasDeductionStats = Number.isSafeInteger(
          G.stats.deductedPoints,
        );
        let gameNeedsSave = false;
        if (!Array.isArray(G.rounds)) G.rounds = [];
        G.cs.forEach((contestant) => {
          if (!contestant.id) {
            contestant.id = newContestantId();
            gameNeedsSave = true;
          }
        });
        G.rounds.forEach((round) => {
          if (!Array.isArray(round.players)) {
            round.players = (round.contestants || [])
              .map((id) => {
                const contestant = G.cs.find((player) => player.id === id);
                return contestant
                  ? {
                      id: contestant.id,
                      n: contestant.n,
                      score: round.scores?.[id] || 0,
                      correct: 0,
                      wrong: 0,
                      deductedPoints: 0,
                      categoryStats: [],
                    }
                  : null;
              })
              .filter(Boolean);
            delete round.contestants;
            delete round.scores;
            gameNeedsSave = true;
          }
        });
        if (!G.cardStatsMigrated) {
          let cardDeductions = 0;
          G.cs.forEach((contestant) => {
            const legacyDeduction =
              (Number.isSafeInteger(contestant.y)
                ? Math.max(0, contestant.y)
                : 0) +
              (Number.isSafeInteger(contestant.r)
                ? Math.max(0, contestant.r)
                : 0) *
                3;
            cardDeductions += legacyDeduction;
            if (Number.isSafeInteger(contestant.deductedPoints))
              contestant.deductedPoints = Math.max(
                0,
                contestant.deductedPoints - legacyDeduction,
              );
            delete contestant.y;
            delete contestant.r;
          });
          if (hasDeductionStats)
            G.stats.deductedPoints = Math.max(
              0,
              G.stats.deductedPoints - cardDeductions,
            );
          G.cardStatsMigrated = true;
          gameNeedsSave = true;
        }
        G.stats.correct = Number.isSafeInteger(G.stats.correct)
          ? Math.max(0, G.stats.correct)
          : 0;
        G.stats.wrong = Number.isSafeInteger(G.stats.wrong)
          ? Math.max(0, G.stats.wrong)
          : 0;
        G.cs.forEach((contestant) => {
          contestant.correct = Number.isSafeInteger(contestant.correct)
            ? Math.max(0, contestant.correct)
            : 0;
          contestant.wrong = Number.isSafeInteger(contestant.wrong)
            ? Math.max(0, contestant.wrong)
            : 0;
          contestant.deductedPoints = Number.isSafeInteger(
            contestant.deductedPoints,
          )
            ? Math.max(0, contestant.deductedPoints)
            : contestant.wrong;
        });
        if (!hasDeductionStats)
          G.stats.deductedPoints = G.cs.reduce(
            (total, contestant) => total + contestant.deductedPoints,
            0,
          );
        else G.stats.deductedPoints = Math.max(0, G.stats.deductedPoints);
        if (gameNeedsSave)
          api("/api/game", "POST", G).catch(() =>
            toast("تعذر حفظ تحديث بيانات اللعبة", 1),
          );
        if (G.cur.q && !G.cur.timer && timerEnabled(cq())) {
          startQuestionTimer(cq());
          G.v = Date.now();
          api("/api/game", "POST", G).catch(() =>
            toast("تعذر الاتصال بالسيرفر", 1),
          );
        }
        const T = ["الكل", ...types()],
          list = Qs.filter((q) => G.f === "الكل" || q.t === G.f),
          duplicates = duplicateQuestionIds(),
          q = cq(),
          cu = G.cur,
          hasO = q?.o?.length,
          top = q?.kind === "top5" || q?.kind === "top10",
          reverse = q?.kind === "reverse",
          visual = q?.kind === "visual",
          audioQuestion = q?.kind === "audio",
          reverseCount = reverse ? Array.from(q.a || "").length : 0,
          reverseIndex = cu.rev?.index || 0,
          timer = cu.timer,
          timerActive = timer && timer.phase !== "done";
        const keepName = $("cn") ? $("cn").value : "";
        const ctx = { T, list, duplicates, q, cu, hasO, top, reverse, visual, audioQuestion, reverseCount, reverseIndex, timer, timerActive };
        $("app").innerHTML = `<div class="tb2">${hdrHTML()}${tabSel === "manage" ? manageHTML(ctx) : playHTML(ctx)}<input id="importQuestionsFile" type="file" accept="${IMPORT_ACCEPT}" hidden onchange="handleQuestionsImport(this)"></div>`;
        if (searchHasFocus && $("questionSearch")) {
          $("questionSearch").focus();
          $("questionSearch").setSelectionRange(searchCursor, searchCursor);
        }
        if (keepName && $("cn")) $("cn").value = keepName;
      }
      let tabSel = "play";
      function setTab(t) {
        tabSel = t;
        render();
      }
      const IMPORT_ACCEPT =
        ".json,.txt,.xlsx,.docx,application/json,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      function hdrHTML() {
        return `<div class="hdr"><div class="tabs" role="tablist"><button role="tab" aria-selected="${tabSel === "play"}" class="${tabSel === "play" ? "act" : ""}" onclick="setTab('play')">اللعب</button><button role="tab" aria-selected="${tabSel === "manage"}" class="${tabSel === "manage" ? "act" : ""}" onclick="setTab('manage')">الأسئلة والإعدادات</button></div><div class="hdr-acts"><button onclick="copyLink()">📺 نسخ رابط الشاشة</button><button onclick="showStats()">📊 الإحصائيات</button><button onclick="undoPointChange()" ${G.pointUndo ? "" : "disabled"}>↶ تراجع عن النقاط</button></div></div>`;
      }
      function catsHTML(T) {
        return `<div class="cats" aria-label="التصنيف">${T.map((t, i) => `<button class="${G.f === t ? "on" : ""}" onclick="setF(${i})">${esc(t)}<span class="cnt">${t === "الكل" ? Qs.length : Qs.filter((x) => x.t === t).length}</span></button>`).join("")}</div>`;
      }
      function optsHTML(q) {
        return `<div class="tbopts">${q.o.map((o, i) => `<div class="tbopt ${q.c === i ? "good" : ""}"><b>${LB[i]}</b><span>${esc(o)}</span>${q.c === i ? '<i class="chk">✓</i>' : ""}</div>`).join("")}</div>`;
      }
      function previewHTML(c) {
        const { q, cu, hasO, top, reverse, visual, audioQuestion } = c;
        if (visual)
          return `<div class="visual-preview">${q.image ? `<img src="${esc(q.image)}" alt="قرينة الصورة">` : ""}${q.emoji ? `<span>${esc(q.emoji)}</span>` : ""}<div class="tbans">الإجابة: ${esc(q.a)}</div></div>`;
        if (audioQuestion)
          return `<div class="visual-preview"><audio controls preload="none" src="${esc(q.audioUrl)}"></audio></div>${hasO ? optsHTML(q) : `<div class="tbans">الإجابة: ${esc(q.a)}</div>`}`;
        if (reverse) return `<div class="tbans">الكلمة: ${esc(q.a)}</div>`;
        if (top)
          return `<div class="tbopts">${q.r.map((a, i) => `<div class="tbopt ${cu.revealed?.includes(i) ? "good" : ""}"><b>${i + 1}</b><span>${esc(a)}</span></div>`).join("")}</div>`;
        return hasO
          ? optsHTML(q)
          : `<div class="tbans">الإجابة: ${esc(q.a)}</div>`;
      }
      function qListHTML(
        list,
        cu,
        withActions,
        duplicates = new Set(),
        emptyText = "لا توجد أسئلة في هذا التصنيف",
      ) {
        return `<div class="qs">${
          list
            .map(
              (x) =>
                `<div class="qi ${x.id === cu.id ? "sel" : ""} ${G.used?.includes(x.id) ? "used" : ""}" onclick="tabSel='play';sel('${x.id}')"><span class="qt">${esc(x.x)}</span>${duplicates.has(x.id) ? '<span class="bdg duplicate" title="يتكرر نص السؤال">مكرر</span>' : ""}<span class="bdg ${x.kind === "reverse" ? "rev" : x.d === "h" ? "hard" : "easy"}">${x.kind === "reverse" ? "معكوسة" : x.d === "h" ? "صعب" : "سهل"}</span>${withActions ? `<button class="icon" title="تعديل" aria-label="تعديل" onclick="event.stopPropagation();openForm('${x.id}')"><img class="action-icon" src="/assets/icons/edit-svgrepo-com.svg" alt=""></button><button class="icon danger" title="حذف" aria-label="حذف السؤال" onclick="event.stopPropagation();del('${x.id}')"><img class="action-icon" src="/assets/icons/icons8-trash.svg" alt=""></button>` : ""}</div>`,
            )
            .join("") || `<small>${emptyText}</small>`
        }</div>`;
      }
      function normalizedQuestionText(text) {
        return String(text ?? "")
          .normalize("NFKC")
          .toLocaleLowerCase("ar")
          .replace(/[أإآ]/g, "ا")
          .replace(/ى/g, "ي")
          .replace(/[\u064B-\u065F\u0670]/g, "")
          .replace(/[^\p{L}\p{N}]/gu, "");
      }
      function duplicateQuestionIds() {
        const groups = new Map();
        Qs.forEach((question) => {
          const key = normalizedQuestionText(question.x);
          if (
            !key ||
            (question.kind === "visual" && key === "خمنالصورة")
          )
            return;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(question.id);
        });
        return new Set(
          [...groups.values()].filter((ids) => ids.length > 1).flat(),
        );
      }
      function filteredManageQuestions(list, duplicates) {
        const query = normalizedQuestionText(questionSearch);
        return list.filter((question) => {
          const text = normalizedQuestionText(
            [
              question.x,
              question.a,
              question.t,
              ...(question.o || []),
              ...(question.r || []),
            ].join(" "),
          );
          return (
            (!query || text.includes(query)) &&
            (questionDifficulty === "all" ||
              question.d === questionDifficulty) &&
            (questionKind === "all" ||
              (question.kind || "normal") === questionKind) &&
            (!duplicateQuestionsOnly || duplicates.has(question.id))
          );
        });
      }
      function updateQuestionSearch(value) {
        questionSearch = value;
        render();
      }
      function updateQuestionFilter(filter, value) {
        if (filter === "difficulty") questionDifficulty = value;
        else if (filter === "kind") questionKind = value;
        else duplicateQuestionsOnly = value;
        render();
      }
      function emptyHTML() {
        if (!Qs.length)
          return `<div class="card empty"><div class="big">ابدأ بإضافة أول سؤال</div><p>الأسئلة والتصنيفات بتتعمل من عندك. أضف سؤالًا جديدًا أو استورد ملف أسئلة جاهزًا.</p><div class="row c"><button class="primary" onclick="openForm()">＋ سؤال جديد</button><button onclick="$('importQuestionsFile').click()">⬆ استيراد أسئلة</button></div></div>`;
        return `<div class="card empty"><div class="big">اختر سؤالًا للبدء</div><p>اضغط «السؤال التالي» أو «عشوائي» من الشريط السفلي، أو اختر سؤالًا بعينه من القائمة.</p></div>`;
      }
      function questionCardHTML(c) {
        const { q, cu, top, reverse } = c;
        if (!q) return emptyHTML();
        const reveal = top
          ? `<div class="reveal">${q.r.map((a, i) => `<button class="${cu.revealed?.includes(i) ? "on" : ""}" onclick="revealRank(${i})">${cu.revealed?.includes(i) ? "تم كشف" : "كشف"} رقم ${i + 1}</button>`).join("")}</div>`
          : "";
        return `<div class="card qcard"><div class="qhead"><span class="bdg">${esc(q.t)}</span><span class="mut">${pts(q)} نقطة</span>${reverse ? '<span class="bdg rev">كلمة معكوسة</span>' : ""}<span class="sp"></span><span class="mut note">معاينة · لا تظهر على الشاشة</span><button class="icon" title="تعديل السؤال" aria-label="تعديل السؤال" onclick="openForm('${q.id}')"><img class="action-icon" src="/assets/icons/edit-svgrepo-com.svg" alt=""></button><button class="icon danger" title="حذف السؤال" aria-label="حذف السؤال" onclick="del('${q.id}')"><img class="action-icon" src="/assets/icons/icons8-trash.svg" alt=""></button></div><div class="qtext">${esc(q.x)}</div>${previewHTML(c)}${reveal}</div>`;
      }
      function timerHTML(c) {
        const { timer, timerActive } = c;
        return `<div class="timer-controls"><div class="game-timer"><div class="timer-readout"><span>${timerPhaseLabel(timer.phase)}${timer.paused ? " · متوقف" : ""}</span><b id="tabletTimerCountdown">${timerSeconds(timer)}</b><small>ثانية</small></div><div class="timer-track"><i id="tabletTimerProgress" style="width:${timerProgress(timer)}%"></i></div></div><button onclick="${timerActive ? "toggleTimer()" : "restartTimer()"}">${timerActive ? (timer.paused ? "▶ استكمال المؤقت" : "⏸ إيقاف المؤقت") : "↻ إعادة المؤقت"}</button>${timerActive ? `<button onclick="restartTimer()">↻ إعادة 30 ثانية</button>` : ""}</div>`;
      }
      function audioHTML(c) {
        const { cu } = c;
        return `<div class="card audio-control-panel"><h3>التحكم في صوت السؤال</h3><div class="row"><button class="big2 on" onclick="setQuestionAudio(${cu.audioControl?.playing === false ? "'play'" : "'pause'"})">${cu.audioControl?.playing === false ? "▶ تشغيل الصوت" : "⏸ إيقاف مؤقت"}</button><button class="big2" onclick="setQuestionAudio('restart')">↺ إعادة من البداية</button></div><label for="questionAudioVolume">مستوى الصوت: <span id="questionAudioVolumeValue">${Math.round((cu.audioControl?.volume ?? 1) * 100)}%</span></label><input id="questionAudioVolume" type="range" min="0" max="100" value="${Math.round((cu.audioControl?.volume ?? 1) * 100)}" oninput="$('questionAudioVolumeValue').textContent=this.value+'%'" onchange="setQuestionAudio('volume',this.value/100)"><small>إذا منع المتصفح التشغيل عن بُعد، اضغط تشغيل على شاشة العرض مرة واحدة.</small></div>`;
      }
      function whoHTML(c) {
        const { q, cu, top } = c,
          round = activeRound(),
          players = activeContestants(),
          eligiblePlayers = players.map((player, index) => ({
            player,
            index,
          }));
        const chips =
          eligiblePlayers
            .map(
              ({ player: p, index: i }) =>
                `<button class="${cu.buz === i ? "on" : ""}" onclick="buz(${i})" ${round?.finished ? "disabled" : ""}>${esc(p.n)}</button>`,
            )
            .join("") ||
          `<small>${G.mode === "rounds" ? "أضف مشاركين من بطاقة الجولات أولًا" : "أضف متسابقين من اللوحة الجانبية"}</small>`;
        const grade =
          cu.buz != null
            ? `<div class="row grade">${top && cu.rank == null ? "<small>اكشف ترتيب الإجابة لتسجيل نقاطها</small>" : `<button class="big2 ok" onclick="grade(1${top ? `,${cu.rank}` : ""})">✅ صح (+${top ? cu.rank + 1 : pts(q)})</button>`}<button class="big2 no" onclick="grade(0)">❌ غلط (−1)</button></div>${cu.res ? `<small class="res ${cu.res}">تم التسجيل: ${cu.res === "ok" ? "صح" : "غلط"}</small>` : ""}`
            : "";
        return `<div class="card who"><h3>من جاوب؟</h3><div class="chips">${chips}</div>${G.mode === "rounds" && !eligiblePlayers.length ? "<small>اختر أو أنشئ جولة وحدد المشاركين أولًا.</small>" : ""}${grade}</div>`;
      }
      function dockHTML(c) {
        const { q, cu, hasO, top, reverse, reverseCount, reverseIndex } = c;
        const nav = `<div class="dock-nav"><button class="primary" onclick="nextQ()">السؤال التالي ‹</button><button onclick="rndQ()"><img class="action-icon" src="/assets/icons/random.svg" alt=""> عشوائي</button></div>`;
        if (!q || !Qs.length) return `<div class="dock">${nav}</div>`;
        const show = reverse
          ? `<button class="big2 on" onclick="nextReverseLetter()" ${reverseIndex >= reverseCount ? "disabled" : ""}>${reverseIndex >= reverseCount ? "اكتملت الحروف" : `إظهار الحرف التالي (${reverseIndex + 1}/${reverseCount})`}</button><button class="big2" onclick="resetReverse()">ابدأ من جديد</button>`
          : `<button class="big2 ${cu.q ? "on" : ""}" onclick="tg('q')">${cu.q ? "إخفاء" : "عرض"} السؤال</button>${hasO ? `<button class="big2 ${cu.o ? "on" : ""}" onclick="tg('o')">${cu.o ? "إخفاء" : "عرض"} الاختيارات</button>` : ""}${top ? "" : `<button class="big2 ${cu.a ? "on" : ""}" onclick="tg('a')">${cu.a ? "إخفاء" : "عرض"} الإجابة</button>`}`;
        return `<div class="dock">${nav}<div class="dock-show">${show}</div></div>`;
      }
      function playersHTML(c) {
        const { cu } = c,
          round = activeRound(),
          players = activeContestants(),
          roundSummary = round
            ? `<div class="round-summary"><b>${esc(round.name)} · الهدف ${round.target} نقطة</b><span>${round.finished ? "انتهت الجولة" : "الجولة مستمرة"}</span>${round.winnerId ? `<strong>🏆 الفائز: ${esc(round.players.find((p) => p.id === round.winnerId)?.n || "متسابق")}</strong>` : ""}</div>`
            : "";
        return `<div class="card players"><h3>${G.mode === "rounds" ? "مشاركو الجولة" : `المتسابقون · ${esc(ME.u)}`}</h3><div class="addrow"><input id="cn" placeholder="${G.mode === "rounds" ? "اسم مشارك جديد في الجولة" : "اسم المتسابق"}" onkeydown="if(event.key==='Enter')addC()"><button class="primary" type="button" aria-label="إضافة متسابق" title="إضافة متسابق" onclick="addC()">+</button></div><div class="round-mode-controls"><button class="${G.mode !== "rounds" ? "on" : ""}" onclick="setGameMode('free')">مسابقة حرة</button><button class="${G.mode === "rounds" ? "on" : ""}" onclick="setGameMode('rounds')">وضع الجولات</button></div>${G.mode === "rounds" ? `<div class="round-manager"><div class="row"><button class="primary" onclick="openRoundForm()">＋ إنشاء جولة</button>${round && !round.finished ? `<button class="danger" onclick="finishRound()">إنهاء الجولة</button>` : ""}</div>${G.rounds.length ? `<div class="round-list">${G.rounds.map((item, index) => `<div class="round-item ${item.id === G.activeRoundId ? "selected" : ""}"><button class="round-select" onclick="activateRound('${item.id}')"><b>${esc(item.name || `الجولة ${index + 1}`)}</b><span>${item.target} نقطة · ${(item.players || []).length} مشاركين${item.finished ? " · منتهية" : ""}</span>${item.winnerId ? `<strong>🏆 ${esc(item.players.find((player) => player.id === item.winnerId)?.n || "فائز")}</strong>` : ""}</button><button class="round-delete danger" title="حذف الجولة" aria-label="حذف ${esc(item.name || `الجولة ${index + 1}`)}" onclick="deleteRound('${item.id}')">🗑</button></div>`).join("")}</div>` : "<small>أنشئ جولة وابدأ بإضافة المشاركين إليها.</small>"}</div>${roundSummary}` : ""}${players.length ? players.map((p, i) => {
          const score = contestantScore(p),
            disabled = !!round?.finished;
          return `<div class="ct ${cu.buz === i ? "tbbuz" : ""}"><div class="top"><b>${esc(p.n)}</b><span class="sc">${score}</span></div><div class="acts"><button aria-label="زيادة نقطة" onclick="ch(${i},'s',1)" ${disabled ? "disabled" : ""}>＋</button><button aria-label="خصم نقطة" onclick="ch(${i},'s',-1)" ${disabled ? "disabled" : ""}>−</button><button class="contestant-reset" onclick="resetContestantScore(${i})" ${disabled ? "disabled" : ""}>تصفير</button><button class="contestant-delete" title="إزالة متسابق" aria-label="إزالة المتسابق" onclick="ch(${i},'x')" ${disabled ? "disabled" : ""}><img class="action-icon" src="/assets/icons/icons8-trash.svg" alt=""></button></div></div>`;
        }).join("") : '<div class="empty-mini">أضف أسماء المتسابقين عشان تقدر تختار مين جاوب.</div>'}<div class="foot"><button class="danger" onclick="resetScores()" ${G.mode === "rounds" && (!round || round.finished) ? "disabled" : ""}>${G.mode === "rounds" ? "تصفير نقاط الجولة" : "تصفير النقاط"}</button></div></div>`;
      }
      function setGameMode(mode) {
        G.mode = mode === "rounds" ? "rounds" : "free";
        if (G.mode === "rounds" && !G.activeRoundId) {
          const nextRound = G.rounds.find((round) => !round.finished);
          G.activeRoundId = nextRound?.id || null;
        }
        G.cur.buz = null;
        G.cur.res = null;
        save();
      }
      function openRoundForm() {
        $("form").innerHTML = `<div class="modal"><div class="card round-form"><h3>إنشاء جولة</h3><label for="roundName">اسم الجولة</label><input id="roundName" maxlength="40" value="الجولة ${G.rounds.length + 1}"><label for="roundTarget">هدف النقاط</label><input id="roundTarget" type="number" min="1" max="100000" value="10"><small>بعد إنشاء الجولة أضف المشاركين لها مباشرة من بطاقة «مشاركو الجولة».</small><div class="row"><button class="primary" onclick="createRound()">إنشاء الجولة</button><button onclick="$('form').innerHTML=''">إلغاء</button></div></div></div>`;
      }
      function createRound() {
        const name = $("roundName").value.trim(),
          target = Number($("roundTarget").value);
        if (!name) return toast("اكتب اسم الجولة", 1);
        if (!Number.isSafeInteger(target) || target < 1 || target > 100000)
          return toast("حدد هدفًا من 1 إلى 100000 نقطة", 1);
        const round = {
          id: newContestantId(),
          name,
          target,
          players: [],
          winnerId: null,
          finished: false,
        };
        G.rounds.push(round);
        G.activeRoundId = round.id;
        G.mode = "rounds";
        G.cur.buz = null;
        G.cur.res = null;
        $("form").innerHTML = "";
        save();
        toast("تم إنشاء الجولة");
      }
      async function deleteRound(id) {
        const index = G.rounds.findIndex((round) => round.id === id);
        if (index < 0) return;
        const round = G.rounds[index];
        if (
          !(await askConfirm(
            `حذف «${round.name}» وكل نتائجها؟ لا يمكن التراجع عن الحذف.`,
            "حذف الجولة",
            "حذف الجولة",
          ))
        )
          return;
        G.rounds.splice(index, 1);
        if (G.activeRoundId === id) {
          G.activeRoundId =
            G.rounds.find((item) => !item.finished)?.id ||
            G.rounds[0]?.id ||
            null;
          if (!G.activeRoundId) G.mode = "free";
          G.cur.buz = null;
          G.cur.res = null;
        }
        save();
        toast("تم حذف الجولة");
      }
      function activateRound(id) {
        const round = G.rounds.find((item) => item.id === id);
        if (!round) return;
        G.activeRoundId = id;
        G.mode = "rounds";
        G.cur.buz = null;
        G.cur.res = null;
        save();
      }
      async function finishRound() {
        const round = activeRound();
        if (!round || round.finished) return;
        if (
          !(await askConfirm(
            `إنهاء «${round.name}»؟ ستظل نتائج الجولة محفوظة ويمكنك بدء جولة أخرى.`,
            "إنهاء الجولة",
            "إنهاء الجولة",
          ))
        )
          return;
        round.finished = true;
        G.cur.buz = null;
        save();
        toast("انتهت الجولة");
      }
      function playHTML(c) {
        const { T, list, q, cu, timer, audioQuestion, duplicates } = c;
        const picker = Qs.length
          ? `<details class="pick"><summary>اختيار سؤال محدد · ${list.length}</summary>${qListHTML(list, cu, false, duplicates)}</details>`
          : "";
        return `<div class="play"><div class="main">${T.length > 1 ? catsHTML(T) : ""}${picker}${questionCardHTML(c)}${q && timer ? `<div class="card">${timerHTML(c)}</div>` : ""}${q && audioQuestion ? audioHTML(c) : ""}${q ? whoHTML(c) : ""}${dockHTML(c)}</div>${playersHTML(c)}</div>`;
      }
      function manageHTML(c) {
        const { T, list, cu, duplicates } = c,
          filtered = filteredManageQuestions(list, duplicates),
          kindLabels = {
            normal: "عادي",
            audio: "صوتي",
            top5: "توب 5",
            top10: "توب 10",
            reverse: "معكوسة",
            visual: "بصري",
          };
        return `<div class="mg"><div class="card"><h3>الأسئلة · ${Qs.length} <small>· ${duplicates.size} سؤال مكرر</small></h3><div class="row"><button class="primary" onclick="openForm()">＋ سؤال جديد</button><button onclick="$('importQuestionsFile').click()">⬆ استيراد أسئلة</button><button onclick="exportQuestions()">⬇ تصدير الأسئلة</button></div><div class="question-filters"><input id="questionSearch" type="search" placeholder="ابحث في السؤال والإجابة والاختيارات" value="${esc(questionSearch)}" oninput="updateQuestionSearch(this.value)"><select aria-label="تصفية حسب الصعوبة" onchange="updateQuestionFilter('difficulty',this.value)"><option value="all" ${questionDifficulty === "all" ? "selected" : ""}>كل الصعوبات</option><option value="e" ${questionDifficulty === "e" ? "selected" : ""}>سهل</option><option value="h" ${questionDifficulty === "h" ? "selected" : ""}>صعب</option></select><select aria-label="تصفية حسب النوع" onchange="updateQuestionFilter('kind',this.value)"><option value="all" ${questionKind === "all" ? "selected" : ""}>كل الأنواع</option>${Object.entries(kindLabels).map(([kind, label]) => `<option value="${kind}" ${questionKind === kind ? "selected" : ""}>${label}</option>`).join("")}</select><label class="duplicate-filter"><input type="checkbox" ${duplicateQuestionsOnly ? "checked" : ""} onchange="updateQuestionFilter('duplicates',this.checked)"> المكررة فقط</label></div><small class="filter-count">عرض ${filtered.length} من ${list.length} في التصنيف المختار</small><details class="import-hint"><summary>طريقة تجهيز ملف الاستيراد</summary><small class="import-hint">استيراد: نسخة JSON، أو TXT/Word (DOCX) بأسطر معنونة، أو Excel (XLSX) بصف عناوين: التصنيف، السؤال، الصعوبة، الاختيار أ، الاختيار ب، الاختيار ج، الاختيار د، الإجابة.</small><div dir="rtl" class="sample">التصنيف: ثقافة عامة<br>السؤال: ما عاصمة مصر؟<br>الصعوبة: سهل<br>الاختيار أ: القاهرة<br>الاختيار ب: الإسكندرية<br>الاختيار ج: الجيزة<br>الاختيار د: الأقصر<br>الإجابة: أ</div><small>افصل كل سؤال عن التالي بسطر فارغ. يمكن ترك الاختيارات والصعوبة فارغة؛ والإجابة تكون نصًا إن لم توجد اختيارات.</small></details>${T.length > 1 ? catsHTML(T) : ""}${qListHTML(filtered, cu, true, duplicates, "لا توجد أسئلة مطابقة للفلاتر")}</div><div class="card"><h3>الثيم والوضع</h3><p class="theme-description">اختار الألوان المناسبة لك. الثيم بيتحفظ على هذا الجهاز والمتصفح.</p>${themeOptionsHTML()}</div><div class="card"><h3>المؤثرات الصوتية</h3><div class="row"><button id="tabletSfxToggle" class="tablet-sfx-toggle ${sfxEnabled ? "on" : ""}" aria-pressed="${sfxEnabled}" onclick="toggleSfx('tabletSfxToggle')">${sfxEnabled ? "🔊 كتم المؤثرات" : "🔇 تفعيل المؤثرات"}</button></div></div><div class="card"><h3>الحساب</h3><div class="row"><button class="danger" onclick="logout()">🚪 خروج</button></div></div></div>`;
      }
      const TIMER_DURATION = 30000;
      function timerEnabled(q) {
        return q && ["normal", "visual", "audio", "top5", "top10"].includes(q.kind);
      }
      function timerPhaseLabel(phase) {
        return phase === "question"
          ? "وقت السؤال"
          : phase === "options"
            ? "وقت الاختيارات"
            : "وقت الإجابة";
      }
      function timerSeconds(timer) {
        return Math.ceil(timerRemaining(timer) / 1000);
      }
      function timerRemaining(timer) {
        return Math.max(
          0,
          timer.paused
            ? timer.remaining
            : timer.deadline - Math.max(Date.now(), timer.startedAt || 0),
        );
      }
      function timerProgress(timer) {
        return Math.min(100, (timerRemaining(timer) / TIMER_DURATION) * 100);
      }
      function updateTimerDisplay() {
        const timer = G?.cur?.timer;
        const display = $("tabletTimerCountdown");
        if (display && timer) {
          const seconds = timerSeconds(timer);
          display.textContent = seconds;
          display
            .closest(".game-timer")
            .classList.toggle("timer-ending", seconds <= 5);
          const progress = $("tabletTimerProgress");
          if (progress) progress.style.width = `${timerProgress(timer)}%`;
        }
      }
      function startQuestionTimer(q, startedAt = Date.now()) {
        G.cur.timer = timerEnabled(q)
          ? {
              phase: "question",
              startedAt,
              deadline: startedAt + TIMER_DURATION,
              remaining: TIMER_DURATION,
              paused: false,
            }
          : null;
      }
      function advanceTimer() {
        const timer = G?.cur?.timer;
        if (!timer || timer.paused || timer.phase === "done") return;
        const q = cq();
        let changed = false;
        while (timer.phase !== "done" && Date.now() >= timer.deadline) {
          if (
            timer.phase === "question" &&
            ["normal", "audio"].includes(q?.kind) &&
            q.o?.length
          ) {
            G.cur.o = 1;
            playSfx("options");
            timer.phase = "options";
          } else if (["top5", "top10"].includes(q?.kind)) {
            G.cur.revealed = Array.from(
              { length: q.r.length },
              (_, index) => index,
            );
            for (let i = 0; i < q.r.length; i++) playSfx("rank");
            G.cur.a = 1;
            timer.phase = "done";
          } else {
            G.cur.a = 1;
            playSfx("answer");
            timer.phase = "done";
          }
          timer.startedAt = timer.deadline;
          timer.deadline += TIMER_DURATION;
          timer.remaining = TIMER_DURATION;
          changed = true;
        }
        if (changed) save();
        else updateTimerDisplay();
      }
      function toggleTimer() {
        const timer = G?.cur?.timer;
        if (!timer || timer.phase === "done") return;
        if (timer.paused) {
          timer.startedAt = Date.now();
          timer.deadline = timer.startedAt + timer.remaining;
          timer.paused = false;
        } else {
          timer.remaining = Math.max(
            0,
            timer.deadline - Math.max(Date.now(), timer.startedAt || 0),
          );
          timer.paused = true;
        }
        save();
      }
      function restartTimer() {
        const q = cq();
        if (!timerEnabled(q)) return;
        const timer = G.cur.timer;
        if (timer && timer.phase !== "done") {
          timer.startedAt = Date.now();
          timer.deadline = timer.startedAt + TIMER_DURATION;
          timer.remaining = TIMER_DURATION;
          timer.paused = false;
        } else {
          G.cur.q = 1;
          G.cur.o = 0;
          G.cur.a = 0;
          startQuestionTimer(q);
        }
        save();
      }
      function recordPointUndo(action) {
        G.pointUndo = {
          action,
          players: G.cs.map((contestant) => ({
            s: contestant.s,
            correct: contestant.correct || 0,
            wrong: contestant.wrong || 0,
            deductedPoints: contestant.deductedPoints || 0,
            categoryStats: JSON.parse(
              JSON.stringify(contestant.categoryStats || []),
            ),
          })),
          stats: JSON.parse(JSON.stringify(G.stats || {})),
          rounds: JSON.parse(JSON.stringify(G.rounds || [])),
          scoreChange: G.scoreChange
            ? JSON.parse(JSON.stringify(G.scoreChange))
            : null,
          current:
            action === "grade"
              ? {
                  id: G.cur.id,
                  res: G.cur.res,
                  a: G.cur.a,
                  timer: G.cur.timer
                    ? JSON.parse(JSON.stringify(G.cur.timer))
                    : null,
                  awards: JSON.parse(JSON.stringify(G.cur.awards || [])),
                }
              : null,
        };
      }
      function undoPointChange() {
        const undo = G?.pointUndo;
        if (!undo) return;
        G.cs.forEach((contestant, index) => {
          const previous = undo.players[index];
          if (!previous) return;
          contestant.s = previous.s;
          contestant.correct = previous.correct;
          contestant.wrong = previous.wrong;
          contestant.deductedPoints = previous.deductedPoints;
          contestant.categoryStats = previous.categoryStats;
        });
        G.stats = undo.stats;
        G.rounds = undo.rounds || [];
        if (undo.scoreChange) G.scoreChange = undo.scoreChange;
        else delete G.scoreChange;
        if (undo.current && G.cur.id === undo.current.id) {
          G.cur.res = undo.current.res;
          G.cur.a = undo.current.a;
          G.cur.timer = undo.current.timer;
          G.cur.awards = undo.current.awards;
        }
        delete G.pointUndo;
        save();
        toast("تم التراجع عن آخر تغيير نقاط");
      }
      function save(preservePointUndo = false) {
        if (!preservePointUndo) delete G.pointUndo;
        G.v = Date.now();
        render();
        api("/api/game", "POST", G).catch(() =>
          toast("تعذر الاتصال بالسيرفر", 1),
        );
      }
      function setQuestionAudio(action, volume = null) {
        const current = G?.cur?.audioControl || {
          seq: 0,
          playing: true,
          volume: 1,
        };
        G.cur.audioControl = {
          seq: (current.seq || 0) + 1,
          action,
          playing:
            action === "pause"
              ? false
              : action === "play" || action === "restart"
                ? true
                : current.playing !== false,
          volume:
            action === "volume"
              ? Math.max(0, Math.min(1, Number(volume)))
              : current.volume ?? 1,
        };
        save();
      }
      function toast(m, bad) {
        const d = document.createElement("div");
        d.className = "toast";
        if (bad) d.style.background = "var(--no)";
        d.textContent = m;
        document.body.append(d);
        setTimeout(() => d.remove(), 2000);
      }
      function setF(i) {
        G.f = ["الكل", ...types()][i];
        save();
      }
      function availableQuestions(questions) {
        G.used = Array.isArray(G.used) ? G.used : [];
        const used = G.used;
        let available = questions.filter((q) => !used.includes(q.id));
        if (!available.length && questions.length > 1) {
          // عند اكتمال الدورة صفّر سجل الاستخدام لهذه المجموعة، مع إبقاء
          // السؤال الحالي مستبعدًا لمنع ظهوره مرتين متتاليتين.
          const questionIds = new Set(questions.map((q) => q.id));
          G.used = used.filter((id) => !questionIds.has(id));
          if (questions.some((q) => q.id === G.cur?.id))
            G.used.push(G.cur.id);
          available = questions.filter((q) => !G.used.includes(q.id));
        }
        return available;
      }
      function rndQ() {
        const l = Qs.filter((q) => G.f === "الكل" || q.t === G.f);
        if (!l.length) return;
        const f = availableQuestions(l);
        if (!f.length) return toast("لا يوجد سؤال آخر في هذا التصنيف", 1);
        const chosen = f[Math.floor(Math.random() * f.length)];
        // الإطارات مؤثر بصري فقط؛ السؤال النهائي يظل واحدًا محددًا ومحفوظًا،
        // وتؤخر بداية المؤقت حتى تنتهي حركة الاختيار على الشاشة.
        const frames = [];
        let offset = 0;
        for (let i = 0; i < 16; i++) {
          const question = f[Math.floor(Math.random() * f.length)];
          frames.push({
            at: offset,
            t: question.t,
            x: question.kind === "reverse" ? "كلمة معكوسة" : question.x,
          });
          offset += 55 + i * 22;
        }
        frames.push({
          at: offset,
          t: chosen.t,
          x: chosen.kind === "reverse" ? "كلمة معكوسة" : chosen.x,
        });
        sel(chosen.id, true, {
          started: Date.now(),
          duration: offset + 500,
          frames,
        });
      }
      function nextQ() {
        const questions = Qs.filter((q) => G.f === "الكل" || q.t === G.f);
        if (!questions.length) return;
        const available = availableQuestions(questions);
        if (!available.length)
          return toast("لا يوجد سؤال آخر في هذا التصنيف", 1);
        const currentIndex = questions.findIndex((q) => q.id === G.cur?.id);
        // التالي يتبع ترتيب القائمة بعد تخطي المستخدم منها، ويلتف للبداية
        // عند الوصول لآخر سؤال متاح في التصنيف.
        const next =
          available.find((q) => questions.indexOf(q) > currentIndex) ||
          available[0];
        sel(next.id, true);
      }
      function sel(id, show = false, roulette = null) {
        // اختيار سؤال جديد يعيد أعلام العرض والإجابة والجرس الخاصة بالجولة
        // السابقة، ويسجل السؤال ضمن الدورة الحالية قبل بث الحالة.
        G.cur = {
          id,
          q: show ? 1 : 0,
          o: 0,
          a: 0,
          displayId: show ? `${Date.now()}-${Math.random()}` : null,
          roulette,
          buz: null,
          res: null,
          revealed: [],
          rank: null,
          awards: [],
          rev: { index: 0, letter: "", started: 0 },
        };
        if (!G.used.includes(id)) G.used.push(id);
        if (show)
          startQuestionTimer(
            cq(),
            Date.now() + (roulette?.duration || 0),
          );
        if (show) playSfx("question");
        save();
      }
      function nextReverseLetter() {
        const q = cq(),
          letters = Array.from(q?.a || "").reverse(),
          rev = G.cur.rev || { index: 0 };
        if (!q || q.kind !== "reverse") return;
        if (rev.started && Date.now() - rev.started < 900)
          return toast("انتظر اختفاء الحرف الحالي", 1);
        if ((rev.index || 0) >= letters.length)
          return toast("انتهت الحروف، ابدأ من جديد", 1);
        const index = (rev.index || 0) + 1;
        G.cur.rev = { index, letter: letters[index - 1], started: Date.now() };
        playSfx("reverse");
        save();
      }
      function resetReverse() {
        G.cur.rev = { index: 0, letter: "", started: 0 };
        save();
      }
      function tg(k) {
        G.cur[k] = +!G.cur[k];
        if (k === "q" && !G.cur.q) {
          G.cur.o = G.cur.a = 0;
          G.cur.roulette = null;
          G.cur.timer = null;
        } else if (k === "q") {
          startQuestionTimer(cq());
          playSfx("question");
        } else if (k === "o" && G.cur.o) {
          playSfx("options");
          const now = Date.now();
          G.cur.timer = {
            phase: "options",
            startedAt: now,
            deadline: now + TIMER_DURATION,
            remaining: TIMER_DURATION,
            paused: false,
          };
        } else if (k === "a" && G.cur.a && G.cur.timer) {
          G.cur.timer.phase = "done";
        }
        if (k === "a" && G.cur.a && !G.cur.res) playSfx("answer");
        save();
      }
      function revealRank(i) {
        if (!G.cur.revealed) G.cur.revealed = [];
        if (!G.cur.revealed.includes(i)) {
          G.cur.revealed.push(i);
          playSfx("rank");
        }
        G.cur.rank = i;
        save();
      }
      function buz(i) {
        const round = activeRound();
        if (
          (G.mode === "rounds" && !round) ||
          (round && (round.finished || !round.players[i]))
        )
          return;
        if (G.cur.buz !== i) playSfx("contestant");
        G.cur.buz = G.cur.buz === i ? null : i;
        G.cur.res = null;
        save();
      }
      function grade(ok, rank = null) {
        if (G.cur.res) return;
        const q = cq(),
          round = activeRound(),
          players = activeContestants(),
          top = q?.kind === "top5" || q?.kind === "top10";
        if (G.mode === "rounds" && !round)
          return toast("أنشئ جولة أو اختر جولة غير منتهية أولًا", 1);
        if (
          round &&
          (round.finished ||
            !players[G.cur.buz])
        )
          return toast("هذا المتسابق غير مشارك في الجولة الحالية", 1);
        if (top && ok && rank == null)
          return toast("اكشف ترتيب الإجابة أولًا", 1);
        const key = top && ok ? `${G.cur.buz}:${rank}` : null;
        if (key && G.cur.awards?.includes(key))
          return toast("تم احتساب نقاط هذا الترتيب للاعب", 1);
        recordPointUndo("grade");
        playSfx(ok ? "correct" : "wrong");
        const contestant = players[G.cur.buz];
        const delta = ok ? (top ? rank + 1 : pts(q)) : -1;
        if (round) {
          contestant.score = roundScore(round, contestant.id) + delta;
          maybeDeclareRoundWinner(round, contestant);
        } else contestant.s += delta;
        contestant[ok ? "correct" : "wrong"]++;
        if (!G.stats) G.stats = { correct: 0, wrong: 0 };
        G.stats[ok ? "correct" : "wrong"]++;
        G.stats.categories = updateCategoryStats(
          G.stats.categories,
          q?.t || "غير مصنف",
          ok,
        );
        contestant.categoryStats = updateCategoryStats(
          contestant.categoryStats,
          q?.t || "غير مصنف",
          ok,
        );
        if (!ok) recordPointDeduction(contestant, 1);
        if (key) {
          if (!G.cur.awards) G.cur.awards = [];
          G.cur.awards.push(key);
        }
        G.cur.res = ok ? "ok" : "no";
        if (ok) G.cur.a = 1;
        if (ok && G.cur.timer) G.cur.timer.phase = "done";
        save(true);
      }
      function updateCategoryStats(categories, category, correct) {
        const result = Array.isArray(categories) ? categories : [];
        let entry = result.find((item) => item.category === category);
        if (!entry) {
          entry = { category, correct: 0, wrong: 0 };
          result.push(entry);
        }
        entry[correct ? "correct" : "wrong"]++;
        return result;
      }
      function categoryPerformanceHTML(contestant) {
        const categories = (contestant.categoryStats || [])
          .filter((item) => item.correct + item.wrong >= 2)
          .map((item) => ({
            ...item,
            accuracy: Math.round(
              (item.correct / (item.correct + item.wrong)) * 100,
            ),
          }));
        if (!categories.length)
          return '<span class="category-performance">أداء الفئات: يلزم إجابتان على الأقل في الفئة</span>';
        if (categories.length === 1)
          return `<span class="category-performance">الأداء في ${esc(categories[0].category)}: ${categories[0].accuracy}% (${categories[0].correct} صح، ${categories[0].wrong} خطأ)</span>`;
        const best = [...categories].sort((a, b) => b.accuracy - a.accuracy)[0],
          weakest = [...categories].sort(
            (a, b) => a.accuracy - b.accuracy,
          )[0];
        return `<span class="category-performance">الأفضل: ${esc(best.category)} (${best.accuracy}%) · يحتاج تحسين: ${esc(weakest.category)} (${weakest.accuracy}%)</span>`;
      }
      function maybeDeclareRoundWinner(round, contestant) {
        if (
          !round.winnerId &&
          roundScore(round, contestant.id) >= round.target
        ) {
          round.winnerId = contestant.id;
          toast(`🏆 ${contestant.n} وصل إلى الهدف وأصبح فائز الجولة`);
        }
      }
      function showStats() {
        const correct = G.stats?.correct || 0,
          wrong = G.stats?.wrong || 0,
          deductedPoints = G.stats?.deductedPoints || 0,
          answered = correct + wrong,
          accuracy = answered ? Math.round((correct / answered) * 100) : 0;
        const rankedContestants = activeContestants()
          .map((contestant) => ({
            contestant,
            score: contestantScore(contestant),
          }))
          .filter((entry) => entry.score !== null);
        const leaders = rankedContestants.length
          ? rankedContestants
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(({ contestant, score }, index) => `<div class="stats-leader"><span>${index + 1}</span><b>${esc(contestant.n)}</b><strong>${score} نقطة</strong></div>`)
              .join("")
          : "<small>لا يوجد متسابقون مسجلون.</small>";
        const currentContestants = activeContestants();
        const contestants = currentContestants.length
          ? currentContestants
              .map((contestant) => {
                const playerCorrect = contestant.correct || 0,
                  playerWrong = contestant.wrong || 0,
                  playerDeductions = contestant.deductedPoints || 0,
                  playerAnswered = playerCorrect + playerWrong,
                  playerAccuracy = playerAnswered
                    ? Math.round((playerCorrect / playerAnswered) * 100)
                    : 0;
                return `<div class="stats-player"><b>${esc(contestant.n)}</b><span class="stats-correct">صح: ${playerCorrect}</span><span class="stats-wrong">خطأ: ${playerWrong}</span><span>النقاط المخصومة: ${playerDeductions}</span><span>الإجمالي: ${playerAnswered} · نسبة الصح: ${playerAccuracy}%</span>${categoryPerformanceHTML(contestant)}</div>`;
              })
              .join("")
          : "<small>لا يوجد متسابقون مسجلون.</small>";
        $("statsModal").innerHTML =
          `<div class="modal stats-modal" onclick="if(event.target===this)closeStats()"><div class="card stats-card" role="dialog" aria-modal="true" aria-labelledby="statsTitle"><div class="stats-header"><h3 id="statsTitle">📊 إحصائيات الإجابات</h3><button onclick="closeStats()">إغلاق</button></div><div class="stats-grid"><div class="stats-item stats-correct"><span>إجابات صحيحة</span><b>${correct}</b></div><div class="stats-item stats-wrong"><span>إجابات خاطئة</span><b>${wrong}</b></div><div class="stats-item"><span>إجمالي الإجابات</span><b>${answered}</b></div><div class="stats-item"><span>نسبة الإجابات الصحيحة</span><b>${accuracy}%</b></div><div class="stats-item stats-deductions"><span>إجمالي النقاط المخصومة</span><b>${deductedPoints}</b></div></div><h3 class="stats-subtitle">🏆 أفضل المتسابقين بالنقاط</h3><div class="stats-leaders">${leaders}</div><h3 class="stats-subtitle">إحصائيات كل متسابق</h3><div class="stats-players">${contestants}</div><div class="stats-actions"><button class="on" onclick="toggleStatsOnScreen()">${G.showStats ? "إخفاء الإحصائيات من شاشة العرض" : "إظهار الإحصائيات على شاشة العرض"}</button><button class="no" onclick="resetStats()">إعادة تسجيل الإحصائيات</button></div><small class="stats-note">إعادة التسجيل تصفّر الإحصائيات فقط، ولا تغيّر النقاط. أداء الفئات يُسجّل من الإجابات الجديدة؛ وتظهر المقارنة بعد إجابتين في الفئة.</small></div></div>`;
      }
      function toggleStatsOnScreen() {
        G.showStats = !G.showStats;
        save();
        showStats();
        toast(
          G.showStats
            ? "تم إظهار الإحصائيات على شاشة العرض"
            : "تم إخفاء الإحصائيات من شاشة العرض",
        );
      }
      function closeStats() {
        $("statsModal").innerHTML = "";
      }
      async function resetStats() {
        if (
          !(await askConfirm(
            "سيتم تصفير الإجابات الصحيحة والخاطئة وإجمالي النقاط المخصومة لكل المتسابقين. لن يتغير رصيد النقاط الحالي. هل تريد المتابعة؟",
            "إعادة تسجيل الإحصائيات",
            "تصفير الإحصائيات",
          ))
        )
          return;
        G.stats = { correct: 0, wrong: 0, deductedPoints: 0, categories: [] };
        G.cs.forEach((contestant) => {
          contestant.correct = 0;
          contestant.wrong = 0;
          contestant.deductedPoints = 0;
          contestant.categoryStats = [];
        });
        G.rounds.forEach((round) =>
          round.players.forEach((contestant) => {
            contestant.correct = 0;
            contestant.wrong = 0;
            contestant.deductedPoints = 0;
            contestant.categoryStats = [];
          }),
        );
        save();
        showStats();
      }
      function addC() {
        const n = $("cn").value.trim();
        if (!n) return;
        const round = activeRound();
        if (G.mode === "rounds") {
          if (!round) return toast("أنشئ جولة أو اختر جولة أولًا", 1);
          if (round.finished)
            return toast("لا يمكن إضافة مشاركين إلى جولة منتهية", 1);
          if (
            round.players.some(
              (player) => player.n.toLocaleLowerCase() === n.toLocaleLowerCase(),
            )
          )
            return toast("هذا المشارك موجود بالفعل في الجولة", 1);
          round.players.push({
            id: newContestantId(),
            n,
            score: 0,
            correct: 0,
            wrong: 0,
            deductedPoints: 0,
            categoryStats: [],
          });
          G.cur.buz = null;
          $("cn").value = "";
          save();
        } else {
          G.cs.push({
            id: newContestantId(),
            n,
            s: 0,
            correct: 0,
            wrong: 0,
            deductedPoints: 0,
            categoryStats: [],
          });
          $("cn").value = "";
          save();
        }
      }
      let confirmResolve = null;
      function askConfirm(
        message,
        title = "تأكيد العملية",
        confirmText = "تأكيد",
      ) {
        if (confirmResolve) finishConfirm(false);
        return new Promise((resolve) => {
          confirmResolve = resolve;
          $("confirmModal").innerHTML =
            `<div class="modal" onclick="if(event.target===this)finishConfirm(false)"><div class="card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle"><h3 id="confirmTitle">${esc(title)}</h3><p>${esc(message)}</p><div class="row confirm-actions"><button onclick="finishConfirm(false)">إلغاء</button><button class="confirm-delete" onclick="finishConfirm(true)">${esc(confirmText)}</button></div></div></div>`;
        });
      }
      function finishConfirm(confirmed) {
        if (!confirmResolve) return;
        const resolve = confirmResolve;
        confirmResolve = null;
        $("confirmModal").innerHTML = "";
        resolve(confirmed);
      }
      async function resetScores() {
        const round = activeRound();
        if (G.mode === "rounds" && (!round || round.finished))
          return toast("اختر جولة غير منتهية أولًا", 1);
        if (
          !(await askConfirm(
            "تصفير نقاط كل المتسابقين؟",
            "تصفير النقاط",
            "تصفير",
          ))
        )
          return;
        recordPointUndo("reset");
        if (round) {
          round.players.forEach((player) => (player.score = 0));
          round.winnerId = null;
        } else G.cs.forEach((c) => (c.s = 0));
        save(true);
      }
      async function resetContestantScore(i) {
        const contestant = activeContestants()[i];
        if (!contestant) return;
        const round = activeRound();
        if (
          G.mode === "rounds" &&
          (!round || round.finished)
        )
          return toast("اختر متسابقًا في جولة غير منتهية", 1);
        if (
          !(await askConfirm(
            `تصفير نقاط ${contestant.n} فقط؟`,
            "تصفير نقاط متسابق",
            "تصفير",
          ))
        )
          return;
        recordPointUndo("reset");
        if (round) {
          contestant.score = 0;
          if (round.winnerId === contestant.id) round.winnerId = null;
        } else contestant.s = 0;
        save(true);
      }
      async function ch(i, k, d) {
        const round = activeRound(),
          players = activeContestants(),
          c = players[i];
        if (!c) return;
        if (k === "x") {
          if (round?.finished)
            return toast("لا يمكن إزالة مشارك من جولة منتهية", 1);
          if (
            !(await askConfirm(
              `${round ? "إزالة" : "حذف"} ${c.n}؟`,
              round ? "إزالة مشارك من الجولة" : "حذف متسابق",
              round ? "إزالة" : "حذف",
            ))
          )
            return;
          players.splice(i, 1);
          if (round?.winnerId === c.id) round.winnerId = null;
          if (G.cur.buz === i) G.cur.buz = null;
          else if (G.cur.buz > i) G.cur.buz--;
        } else if (k === "s") {
          if (G.mode === "rounds" && (!round || round.finished))
            return toast("اختر متسابقًا مشاركًا في جولة غير منتهية", 1);
          recordPointUndo("manual");
          if (round) {
            c.score = roundScore(round, c.id) + d;
            maybeDeclareRoundWinner(round, c);
          } else c.s += d;
          if (d < 0) recordPointDeduction(c, -d);
          G.scoreChange = {
            id: `${Date.now()}-${Math.random()}`,
            contestant: c.n,
            delta: d,
            score: contestantScore(c),
          };
        }
        save(k === "s");
      }
      function recordPointDeduction(contestant, points) {
        if (!G.stats || typeof G.stats !== "object")
          G.stats = { correct: 0, wrong: 0, deductedPoints: 0 };
        G.stats.deductedPoints = (G.stats.deductedPoints || 0) + points;
        contestant.deductedPoints =
          (contestant.deductedPoints || 0) + points;
      }
      async function del(id) {
        if (!(await askConfirm("حذف السؤال نهائيًا؟", "حذف سؤال", "حذف")))
          return;
        try {
          await api("/api/questions/" + id, "DELETE");
          G.used = (G.used || []).filter((usedId) => usedId !== id);
          if (G.cur.id === id)
            G.cur = {
              id: null,
              q: 0,
              o: 0,
              a: 0,
              buz: null,
              res: null,
            };
          save();
          toast("تم الحذف");
        } catch (e) {
          toast(e.message, 1);
        }
      }
      async function exportQuestions(format) {
        if (!format) {
          $("form").innerHTML =
            `<div class="modal" onclick="if(event.target===this)$('form').innerHTML=''"><div class="card"><h3>اختر صيغة تصدير الأسئلة</h3><small class="import-hint">JSON نسخة احتياطية كاملة تشمل كل أنواع الأسئلة وملفات الصوت المرفوعة. TXT وExcel وWord للتبادل وتشمل الأسئلة العادية فقط.</small><div class="row"><button class="big2 on" onclick="exportQuestions('json')">JSON — نسخة كاملة</button><button class="big2" onclick="exportQuestions('xlsx')">Excel — XLSX</button><button class="big2" onclick="exportQuestions('docx')">Word — DOCX</button><button class="big2" onclick="exportQuestions('txt')">ملف نصي — TXT</button><button class="big2" onclick="$('form').innerHTML=''">إلغاء</button></div></div></div>`;
          return;
        }
        try {
          const response = await fetch(
            `/api/questions/export?format=${encodeURIComponent(format)}`,
          );
          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || "تعذر تصدير الأسئلة");
          }
          const blob = await response.blob(),
            url = URL.createObjectURL(blob),
            link = document.createElement("a");
          link.href = url;
          link.download = {
            json: "quiz-questions-backup.json",
            txt: "quiz-questions.txt",
            xlsx: "quiz-questions.xlsx",
            docx: "quiz-questions.docx",
          }[format];
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          $("form").innerHTML = "";
          toast("تم تنزيل ملف الأسئلة");
        } catch (e) {
          $("form").innerHTML = "";
          toast(e.message, 1);
        }
      }
      async function handleQuestionsImport(input) {
        const file = input.files[0];
        input.value = "";
        if (!file) return;
        const extension = file.name.split(".").pop().toLowerCase();
        if (!["json", "txt", "xlsx", "docx"].includes(extension))
          return toast("اختر JSON أو TXT أو Excel XLSX أو Word DOCX", 1);
        const maxSize = extension === "json" ? 75 : 10;
        if (file.size > maxSize * 1024 * 1024)
          return toast(`حجم الملف يجب ألا يتجاوز ${maxSize} ميجابايت`, 1);
        if (extension !== "json") {
          if (
            !(await askConfirm(
              "سيتم قراءة الأسئلة من الملف وإضافتها إلى أسئلتك الحالية دون حذفها. هل تريد المتابعة؟",
              "استيراد الأسئلة",
              "استيراد",
            ))
          )
            return;
          try {
            const response = await fetch("/api/questions/import-file", {
                method: "POST",
                headers: { "X-Import-Extension": extension },
                body: file,
              }),
              result = await response.json();
            if (!response.ok)
              throw new Error(result.error || "تعذر استيراد الأسئلة");
            toast(`تم استيراد ${result.imported} سؤال`);
          } catch (e) {
            toast(e.message, 1);
          }
          return;
        }
        let backup;
        try {
          backup = JSON.parse(await file.text());
        } catch {
          return toast("تعذر قراءة الملف؛ اختر نسخة JSON صالحة", 1);
        }
        if (
          backup?.format !== "quiz-app-questions" ||
          backup.version !== 1 ||
          !Array.isArray(backup.questions)
        )
          return toast("صيغة النسخة الاحتياطية غير مدعومة", 1);
        if (
          !(await askConfirm(
            `سيتم إضافة ${backup.questions.length} سؤال إلى أسئلتك الحالية دون حذفها. هل تريد المتابعة؟`,
            "استيراد الأسئلة",
            "استيراد",
          ))
        )
          return;
        try {
          const response = await fetch("/api/questions/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: file,
            }),
            result = await response.json();
          if (!response.ok) throw new Error(result.error || "تعذر استيراد الأسئلة");
          toast(`تم استيراد ${result.imported} سؤال`);
        } catch (e) {
          toast(e.message, 1);
        }
      }
      function openForm(id) {
        const e = Qs.find((x) => x.id === id) || {
          o: [],
          r: [],
          kind: "normal",
          d: "e",
          t: G.f !== "الكل" ? G.f : "",
        };
        $("form").innerHTML =
          `<div class="modal"><div class="card"><h3>${id ? "تعديل سؤال" : "سؤال جديد"}</h3>
 <input id="ft" placeholder="النوع (ديني، ثقافة عامة...)" list="tl" value="${esc(e.t)}"><datalist id="tl">${types()
   .map((t) => `<option value="${esc(t)}">`)
   .join("")}</datalist>
 <select id="fk" onchange="toggleQuestionKind()"><option value="normal" ${e.kind === "normal" ? "selected" : ""}>سؤال عادي</option><option value="audio" ${e.kind === "audio" ? "selected" : ""}>سؤال صوتي</option><option value="top5" ${e.kind === "top5" ? "selected" : ""}>توب 5 — إجابات مرتبة</option><option value="top10" ${e.kind === "top10" ? "selected" : ""}>توب 10 — إجابات مرتبة</option><option value="reverse" ${e.kind === "reverse" ? "selected" : ""}>كلمات معكوسة</option><option value="visual" ${e.kind === "visual" ? "selected" : ""}>خمن صورة أو إيموجي</option></select>
 <div id="questionFields"><input id="fx" placeholder="نص السؤال" value="${esc(e.x)}"></div>
 <div id="audioFields" hidden><input id="fau" type="url" dir="ltr" placeholder="رابط ملف صوتي مباشر (اختياري)" value="${esc(e.audioUrl || "")}" oninput="$('fauFile').value=''"><small>يمكنك لصق رابط مباشر لملف صوتي، أو رفع ملف من جهازك. روابط صفحات YouTube وSpotify لا تعمل كمصدر صوت؛ ارفع ملفًا صوتيًا تملك حق استخدامه. الصيغ المدعومة: MP3 وWAV وOGG وM4A وAAC، بحد أقصى 20 ميجابايت.</small><label for="fauFile">اختيار ملف صوتي من الجهاز</label><input id="fauFile" type="file" accept=".mp3,.wav,.ogg,.oga,.opus,.m4a,.aac"><small id="audioUploadStatus" aria-live="polite"></small></div>
 <label for="fd">صعوبة السؤال</label><select id="fd"><option value="e" ${e.d === "e" ? "selected" : ""}>سهل (نقطة)</option><option value="h" ${e.d === "h" ? "selected" : ""}>صعب (نقطتان)</option></select>
 <div id="normalFields">
 <small>الاختيارات — اتركها فارغة لو السؤال بدون اختيارات</small>
 ${[0, 1, 2, 3].map((i) => `<input id="fo${i}" placeholder="الاختيار ${LB[i]}" value="${esc(e.o?.[i])}">`).join("")}
 <select id="fc">${LB.map((l, i) => `<option value="${i}" ${e.c === i ? "selected" : ""}>الصحيح: ${l}</option>`).join("")}</select>
 <input id="fa" placeholder="الإجابة النصية (لو بدون اختيارات)" value="${esc(e.a)}">
 </div><div id="topFields" hidden><small>اكتب الإجابات بالترتيب من المركز الأول إلى ${e.kind === "top10" ? "العاشر" : "الخامس"}</small>${Array.from({ length: 10 }, (_, i) => `<input id="fr${i}" placeholder="الإجابة رقم ${i + 1}" value="${esc(e.r?.[i])}" ${i >= 5 && e.kind !== "top10" ? "hidden" : ""}>`).join("")}</div><div id="reverseFields" hidden><input id="frw" maxlength="40" dir="auto" placeholder="الكلمة الأصلية" value="${esc(e.a || "")}"></div><div id="visualFields" hidden><input id="fvp" maxlength="500" placeholder="اكتب سؤالًا يميز الصورة (مثال: من صاحب هذا الشعار؟)" value="${esc(e.x === "خمن الصورة" ? "" : e.x || "")}"><input id="fva" placeholder="الإجابة أو الكلمة المطلوب تخمينها" value="${esc(e.a || "")}"><input id="fi" type="url" dir="ltr" placeholder="رابط صورة مباشر (اختياري)" value="${esc(e.image || "")}"><input id="fe" maxlength="20" placeholder="إيموجي دالّ (اختياري)" value="${esc(e.emoji || "")}"><small>اكتب سؤالًا خاصًا بهذه الصورة، ثم أضف رابط صورة أو إيموجي، أو الاثنين معًا.</small></div>
 <div class="row"><button id="saveQuestionBtn" class="on big2" onclick="saveQ('${id || ""}')">💾 حفظ</button><button class="big2" onclick="$('form').innerHTML=''">إلغاء</button></div></div></div>`;
        toggleQuestionKind();
      }
      function toggleQuestionKind() {
        const kind = $("fk").value;
        $("questionFields").hidden = ["reverse", "visual", "audio"].includes(kind);
        $("normalFields").hidden = kind !== "normal" && kind !== "audio";
        $("audioFields").hidden = kind !== "audio";
        $("topFields").hidden = kind !== "top5" && kind !== "top10";
        if (!$("topFields").hidden)
          $("topFields").querySelector("small").textContent =
            `اكتب الإجابات بالترتيب من المركز الأول إلى ${kind === "top10" ? "العاشر" : "الخامس"}`;
        $("topFields")
          .querySelectorAll("input")
          .forEach((input, i) => (input.hidden = i >= 5 && kind !== "top10"));
        $("reverseFields").hidden = kind !== "reverse";
        $("visualFields").hidden = kind !== "visual";
      }
      async function saveQ(id) {
        const g = (k) => $(k).value.trim(),
          kind = $("fk").value,
          o =
            kind === "normal" || kind === "audio"
              ? [0, 1, 2, 3].map((i) => g("fo" + i)).filter(Boolean)
              : [],
          r =
            kind === "top5" || kind === "top10"
              ? Array.from(
                  { length: kind === "top10" ? 10 : 5 },
                  (_, i) => g("fr" + i),
                )
              : [],
          word = kind === "reverse" ? g("frw") : "";
        const image = kind === "visual" ? g("fi") : "",
          emoji = kind === "visual" ? g("fe") : "",
          audioFile = kind === "audio" ? $("fauFile").files[0] : null;
        let audioUrl = kind === "audio" ? g("fau") : "";
        if (kind === "audio" && !audioFile) {
          try {
            if (!/^\/audio\/[0-9a-f-]{36}$/i.test(audioUrl)) {
              const url = new URL(audioUrl);
              if (
                !["http:", "https:"].includes(url.protocol) ||
                /(^|\.)((youtube\.com)|(youtube-nocookie\.com)|(youtu\.be)|(spotify\.com)|(spotify\.link))$/i.test(
                  url.hostname,
                )
              )
                throw new Error();
            }
            if (!audioUrl) throw new Error();
          } catch {
            return toast(
              "أضف ملفًا صوتيًا أو رابطًا مباشرًا؛ روابط YouTube وSpotify لا تعمل هنا",
              1,
            );
          }
        }
        if (
          audioFile &&
          (audioFile.size > 20 * 1024 * 1024 ||
            !/\.(mp3|wav|ogg|oga|opus|m4a|aac)$/i.test(audioFile.name))
        )
          return toast(
            "اختر ملف MP3 أو WAV أو OGG أو M4A أو AAC لا يتجاوز 20 ميجابايت",
            1,
          );
        if (
          !g("ft") ||
          (kind === "reverse"
            ? !word
            : kind === "visual"
              ? !g("fvp") || !g("fva") || (!image && !emoji)
              : kind === "audio"
                ? !audioUrl && !audioFile
                : !g("fx"))
        )
          return toast(
            kind === "visual"
              ? "اكتب نص السؤال والإجابة وأضف صورة أو إيموجي"
              : kind === "reverse"
                ? "اكتب النوع والكلمة"
                : kind === "audio"
                  ? "أضف ملفًا صوتيًا أو رابطًا مباشرًا"
                : "اكتب النوع والسؤال",
            1,
          );
        if (
          kind === "top5" || kind === "top10"
            ? r.some((a) => !a)
            : kind === "reverse" || kind === "visual"
              ? false
              : o.length
                ? o.length < 4
                : !g("fa")
        )
          return toast(
            kind === "top5" || kind === "top10"
              ? `اكتب الإجابات ${kind === "top10" ? "العشر" : "الخمس"} بالترتيب`
              : "أكمل 4 اختيارات أو اكتب إجابة نصية",
            1,
          );
        const saveButton = $("saveQuestionBtn");
        saveButton.disabled = true;
        let uploadedAudioUrl = "";
        try {
          if (audioFile) {
            $("audioUploadStatus").textContent = "جارٍ رفع الملف...";
            const response = await fetch("/api/audio", {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                "X-Audio-Extension": audioFile.name.split(".").pop(),
              },
              body: audioFile,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "تعذر رفع الملف");
            uploadedAudioUrl = result.url;
            audioUrl = uploadedAudioUrl;
          }
          await api("/api/questions", "POST", {
            id: id || undefined,
            t: g("ft"),
            d: g("fd"),
            x:
              kind === "visual"
                ? g("fvp")
                : kind === "audio"
                  ? "استمع إلى الصوت"
                : kind === "reverse"
                  ? word
                  : g("fx"),
            kind,
            r,
            o,
            c: o.length ? +g("fc") : -1,
            a:
              kind === "reverse"
                ? word
                : kind === "visual"
                  ? g("fva")
                  : g("fa"),
            image,
            emoji,
            audioUrl,
          });
          $("form").innerHTML = "";
          toast("✔ اتحفظ في قاعدة البيانات");
        } catch (e) {
          let cleanupFailed = false;
          if (uploadedAudioUrl) {
            try {
              await api(
                uploadedAudioUrl.replace("/audio/", "/api/audio/"),
                "DELETE",
              );
            } catch {
              cleanupFailed = true;
            }
          }
          saveButton.disabled = false;
          toast(
            cleanupFailed
              ? `${e.message} — وتعذر تنظيف الملف المرفوع`
              : e.message,
            1,
          );
        }
      }
      let ME = null;
      function copyLink() {
        const l = location.origin + "/screen/" + ME.room;
        (navigator.clipboard
          ? navigator.clipboard.writeText(l)
          : Promise.reject()
        )
          .then(() => toast("اتنسخ الرابط"))
          .catch(() => prompt("انسخ الرابط:", l));
      }
      async function logout() {
        await api("/api/logout", "POST");
        location = "/";
      }
      api("/api/me")
        .then((m) => {
          ME = m;
          connect(render);
          setInterval(advanceTimer, 200);
          setInterval(updateTimerDisplay, 200);
          setInterval(() => api("/api/ping").catch(() => {}), 240000);
        })
        .catch(() => (location = "/"));
