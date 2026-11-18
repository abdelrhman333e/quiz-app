const $ = (id) => document.getElementById(id);
      const pts = (q) => PT[q.d];
      const MAX_VISUAL_CLARITY = 5;
      function visualClarityLevel(cu = G?.cur) {
        return Number.isSafeInteger(cu?.visualClarity)
          ? Math.max(0, Math.min(MAX_VISUAL_CLARITY, cu.visualClarity))
          : 0;
      }
      function visualBlurAmount(cu = G?.cur) {
        if (cu?.a) return 0;
        return Math.round(
          (24 * (MAX_VISUAL_CLARITY - visualClarityLevel(cu)) * 10) /
            MAX_VISUAL_CLARITY,
        ) / 10;
      }
      let audioPlaybackState = null;
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
      let pendingGameSave = null,
        gameSavePromise = null;
      function advanceGameVersion() {
        G.v = Math.max(Date.now(), (Number.isSafeInteger(G.v) ? G.v : 0) + 1);
      }
      function startGameSaveQueue() {
        if (gameSavePromise) return;
        gameSavePromise = (async () => {
          while (pendingGameSave) {
            const pending = pendingGameSave;
            pendingGameSave = null;
            try {
              await api("/api/game", "POST", pending.state);
            } catch {
              toast(pending.errorMessage, 1);
            }
          }
        })().finally(() => {
          gameSavePromise = null;
          if (pendingGameSave) startGameSaveQueue();
        });
      }
      function persistGame(errorMessage) {
        pendingGameSave = {
          state: JSON.parse(JSON.stringify(G)),
          errorMessage,
        };
        startGameSaveQueue();
      }
      let openFilterMenu = null,
        questionSearch = "",
        questionDifficulty = "all",
        questionKind = "all",
        duplicateQuestionsOnly = false,
        selectedQuestionIds = new Set(),
        visibleManageQuestionIds = [];
      function render() {
        if (!G) return;
        const availableQuestionIds = new Set(Qs.map((question) => question.id));
        selectedQuestionIds.forEach((id) => {
          if (!availableQuestionIds.has(id)) selectedQuestionIds.delete(id);
        });
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
        if (gameNeedsSave) {
          advanceGameVersion();
          persistGame("تعذر حفظ تحديث بيانات اللعبة");
        }
        if (G.cur.q && !G.cur.timer && timerEnabled(cq())) {
          startQuestionTimer(cq());
          advanceGameVersion();
          persistGame("تعذر الاتصال بالسيرفر");
        }
        if (tabSel === "intro" && $("tabletIntroVideoFrame")) {
          const introControls = document.querySelectorAll(
            ".tablet-intro-controls button",
          );
          if (introControls.length === 2) {
            introControls[0].disabled = !!G.introVideoVisible;
            introControls[1].disabled = !G.introVideoVisible;
          }
          return;
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
          career = q?.kind === "career",
          clubIndex = Number.isInteger(cu.clubIndex) ? cu.clubIndex : -1,
          reverseCount = reverse ? Array.from(q.a || "").length : 0,
          reverseIndex = cu.rev?.index || 0,
          timer = cu.timer,
          timerActive = timer && timer.phase !== "done";
        const keepName = $("cn") ? $("cn").value : "";
        const ctx = { T, list, duplicates, q, cu, hasO, top, reverse, visual, audioQuestion, career, clubIndex, reverseCount, reverseIndex, timer, timerActive };
        $("app").innerHTML = `<div class="tb2">${hdrHTML()}${tabSel === "manage" ? manageHTML(ctx) : tabSel === "contact" ? contactHTML() : tabSel === "intro" ? introHTML() : playHTML(ctx)}<input id="importQuestionsFile" type="file" accept="${IMPORT_ACCEPT}" hidden onchange="handleQuestionsImport(this)"></div>`;
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
      const CONTACT_EMAIL = "abdo267895@gmail.com";
      function contactHTML() {
        return `<section class="contact-panel card"><h2>تواصل معنا</h2><p>واجهت مشكلة أو عندك اقتراح؟ اكتب رسالتك وسيفتح تطبيق البريد لإرسالها.</p><form class="contact-form" onsubmit="sendContact(event)"><label for="contactSubject">موضوع الرسالة</label><input id="contactSubject" maxlength="120" placeholder="مثال: مشكلة في الجولة"><label for="contactMessage">رسالتك</label><textarea id="contactMessage" rows="7" required maxlength="5000" placeholder="اكتب تفاصيل المشكلة أو اقتراحك هنا"></textarea><button class="primary" type="submit">✉️ إرسال بالبريد</button></form><div class="contact-links"><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><a href="https://abdelrhman333e-web.vercel.app/" target="_blank" rel="noopener noreferrer">موقعي الشخصي</a></div><small>سيتم فتح برنامج البريد على جهازك، ولن تُرسل الرسالة إلا بعد تأكيدها هناك.</small></section>`;
      }
      function sendContact(event) {
        event.preventDefault();
        const subject =
          $("contactSubject").value.trim() || "رسالة من موقع المسابقة";
        const body = $("contactMessage").value.trim();
        if (!body) return toast("اكتب رسالتك أولًا", 1);
        const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
      }
      function introHTML() {
        return `<section class="card tablet-intro"><h2>الفيديو التعريفي</h2><p>شاهد شرح اللعبة هنا، أو اعرضه على شاشة المسابقة المتصلة.</p><div class="row tablet-intro-controls"><button class="primary" onclick="setIntroVideoOnScreen(true)" ${G.introVideoVisible ? "disabled" : ""}>▶ عرض على شاشة المسابقة</button><button onclick="setIntroVideoOnScreen(false)" ${G.introVideoVisible ? "" : "disabled"}>إيقاف العرض على الشاشة</button></div><iframe id="tabletIntroVideoFrame" src="/code_artifact.html?embed=tablet" title="الفيديو التعريفي" allow="autoplay; fullscreen"></iframe></section>`;
      }
      function setIntroVideoOnScreen(visible) {
        G.introVideoVisible = visible;
        save(true);
        toast(
          visible
            ? "تم عرض الفيديو على شاشة المسابقة"
            : "تم إيقاف الفيديو على شاشة المسابقة",
        );
      }
      function hdrHTML() {
        return `<div class="hdr"><div class="tabs" role="tablist"><button role="tab" aria-selected="${tabSel === "play"}" class="${tabSel === "play" ? "act" : ""}" onclick="setTab('play')">اللعب</button><button role="tab" aria-selected="${tabSel === "manage"}" class="${tabSel === "manage" ? "act" : ""}" onclick="setTab('manage')">الأسئلة والإعدادات</button><button role="tab" aria-selected="${tabSel === "intro"}" class="${tabSel === "intro" ? "act" : ""}" onclick="setTab('intro')">الفيديو التعريفي</button><button role="tab" aria-selected="${tabSel === "contact"}" class="${tabSel === "contact" ? "act" : ""}" onclick="setTab('contact')">التواصل</button></div><div class="hdr-acts"><button onclick="copyLink()">📺 نسخ رابط الشاشة</button><button onclick="copyBuzzerLink()">🔔 رابط جرس المتسابقين</button><button onclick="showStats()">📊 الإحصائيات</button><button onclick="undoPointChange()" ${G.pointUndo ? "" : "disabled"}>↶ تراجع عن النقاط</button></div></div>`;
      }
      function catsHTML(T) {
        return `<div class="cats" aria-label="التصنيف">${T.map((t, i) => `<button class="${G.f === t ? "on" : ""}" onclick="setF(${i})">${esc(t)}<span class="cnt">${t === "الكل" ? Qs.length : Qs.filter((x) => x.t === t).length}</span></button>`).join("")}</div>`;
      }
      function optsHTML(q) {
        return `<div class="tbopts">${q.o.map((o, i) => `<div class="tbopt ${q.c === i ? "good" : ""}"><b>${LB[i]}</b><span>${esc(o)}</span>${q.c === i ? '<i class="chk">✓</i>' : ""}</div>`).join("")}</div>`;
      }
      function embeddedAudioProvider(audioUrl) {
        try {
          const url = new URL(audioUrl),
            host = url.hostname.toLowerCase(),
            youtubeHosts = [
              "youtube.com",
              "www.youtube.com",
              "m.youtube.com",
              "music.youtube.com",
              "youtu.be",
              "youtube-nocookie.com",
              "www.youtube-nocookie.com",
            ];
          if (youtubeHosts.includes(host)) {
            const videoId =
              host === "youtu.be"
                ? url.pathname.split("/")[1]
                : url.searchParams.get("v") ||
                  url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
            return /^[\w-]{11}$/.test(videoId || "") ? "youtube" : "invalid";
          }
          if (host === "open.spotify.com")
            return /\/(?:track|album|playlist|episode|show)\/[a-zA-Z0-9]+/.test(
              url.pathname,
            )
              ? "spotify"
              : "invalid";
          if (host === "soundcloud.com" || host === "www.soundcloud.com")
            return url.pathname.length > 1 ? "soundcloud" : "invalid";
        } catch {}
        return "";
      }
      function validClubImage(value) {
        const image = value.trim();
        if (image.length > 100_000) return false;
        if (image.startsWith("data:"))
          return /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(
            image,
          );
        if (image.length > 1000) return false;
        if (image.startsWith("/") && !image.startsWith("//")) return true;
        try {
          return ["http:", "https:"].includes(new URL(image).protocol);
        } catch {
          return false;
        }
      }
      function previewHTML(c) {
        const { q, cu, hasO, top, reverse, visual, audioQuestion, career } = c;
        if (career)
          return `<div class="career-preview">${(q.clubs || []).map((club, i) => `<div><img src="${esc(club.image)}" alt=""><span>${esc(club.n || `النادي ${i + 1}`)}</span></div>`).join("")}</div><div class="tbans">اللاعب: ${esc(q.a)}</div>`;
        if (visual)
          return `<div class="visual-preview">${q.image ? `<img src="${esc(q.image)}" alt="قرينة الصورة" style="filter:blur(${q.blurEnabled === true ? visualBlurAmount(cu) : 0}px)">` : ""}${q.emoji ? `<span>${esc(q.emoji)}</span>` : ""}<div class="tbans">الإجابة: ${esc(q.a)}</div></div>`;
        if (audioQuestion)
          return `<div class="visual-preview">${embeddedAudioProvider(q.audioUrl) ? `<a href="${esc(q.audioUrl)}" target="_blank" rel="noopener noreferrer">فتح مصدر الصوت</a>` : `<audio controls preload="none" src="${esc(q.audioUrl)}"></audio>`}</div>${hasO ? optsHTML(q) : `<div class="tbans">الإجابة: ${esc(q.a)}</div>`}`;
        if (reverse) return `<div class="tbans">الكلمة: ${esc(q.a)}</div>`;
        if (top)
          return `<div class="tbopts">${q.r.map((a, i) => `<div class="tbopt ${cu.revealed?.includes(i) ? "good" : ""}"><b>${i + 1}</b><span>${esc(a)}</span></div>`).join("")}</div>`;
        return hasO
          ? optsHTML(q)
          : `<div class="tbans">الإجابة: ${esc(q.a)}</div>`;
      }
      function qCardsHTML(list, cu, duplicates, emptyText) {
        const KIND = {
          normal: ["📝", "عادي"],
          audio: ["🎧", "صوتي"],
          top5: ["🏆", "توب 5"],
          top10: ["🏆", "توب 10"],
          reverse: ["🔄", "معكوسة"],
          visual: ["🖼️", "بصري"],
          career: ["⚽", "مسيرة لاعب"],
        };
        const answerOf = (x) => {
          if (Array.isArray(x.o) && x.o.length && Number.isInteger(x.c) && x.c >= 0 && x.o[x.c] != null) return x.o[x.c];
          return x.a || "";
        };
        const card = (x) => {
          const kind = KIND[x.kind] ? x.kind : "normal";
          const [icon, label] = KIND[kind];
          let title = esc(x.x);
          let sub = "";
          let thumb = "";
          let clubs = "";
          if (kind === "career") {
            title = esc(x.a || "—");
            sub = esc(x.x || "مين اللاعب؟");
            if (Array.isArray(x.clubs) && x.clubs.length)
              clubs = `<div class="qc-clubs" aria-label="الأندية">${x.clubs.map((c) => `<span class="qc-club" title="${esc(c.n)}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`).join("")}<small>${x.clubs.length} أندية</small></div>`;
          } else if (kind === "reverse") {
            sub = "كلمة تُعرض معكوسة";
          } else if (kind === "top5" || kind === "top10") {
            sub = `${(x.r || []).length} إجابات مرتبة`;
          } else if (kind === "audio") {
            sub = answerOf(x) ? `الإجابة: ${esc(answerOf(x))}` : "سؤال صوتي";
          } else {
            const a = answerOf(x);
            sub = a ? `الإجابة: ${esc(a)}` : "";
          }
          if (kind === "visual") {
            if (x.image) thumb = `<span class="qc-thumb"><img src="${esc(x.image)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
            else if (x.emoji) thumb = `<span class="qc-thumb emoji">${esc(x.emoji)}</span>`;
          }
          const hard = x.d === "h";
          const cls = ["qc", x.id === cu.id ? "sel" : "", selectedQuestionIds.has(x.id) ? "bulk-selected" : "", G.used?.includes(x.id) ? "used" : ""].join(" ");
          return `<div class="${cls}" data-kind="${kind}" onclick="tabSel='play';sel('${x.id}')">
            <div class="qc-top">
              <input class="question-selection" type="checkbox" aria-label="تحديد السؤال للحذف" ${selectedQuestionIds.has(x.id) ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleQuestionSelection('${x.id}',this.checked)">
              <span class="qc-chip qc-kind">${icon} ${label}</span>
              <span class="qc-chip ${hard ? "qc-hard" : "qc-easy"}"><i></i>${hard ? "صعب" : "سهل"}</span>
              ${x.t ? `<span class="qc-chip qc-cat">${esc(x.t)}</span>` : ""}
              ${duplicates.has(x.id) ? '<span class="qc-chip qc-dup" title="يتكرر نص السؤال">مكرر</span>' : ""}
              ${G.used?.includes(x.id) ? '<span class="qc-chip qc-used">استُخدم</span>' : ""}
              <span class="qc-sp"></span>
              <button class="icon" title="تعديل" aria-label="تعديل" onclick="event.stopPropagation();openForm('${x.id}')"><img class="action-icon" src="/assets/icons/edit-svgrepo-com.svg" alt=""></button>
              <button class="icon danger" title="حذف" aria-label="حذف السؤال" onclick="event.stopPropagation();del('${x.id}')"><img class="action-icon" src="/assets/icons/icons8-trash.svg" alt=""></button>
            </div>
            <div class="qc-body">${thumb}<div class="qc-main"><div class="qc-title">${title}</div>${sub ? `<div class="qc-sub">${sub}</div>` : ""}</div></div>
            ${clubs}
          </div>`;
        };
        return `<div class="qgrid">${list.map(card).join("") || `<small>${emptyText}</small>`}</div>`;
      }
      function qListHTML(
        list,
        cu,
        withActions,
        duplicates = new Set(),
        emptyText = "لا توجد أسئلة في هذا التصنيف",
      ) {
        if (withActions) return qCardsHTML(list, cu, duplicates, emptyText);
        return `<div class="qs">${
          list
            .map(
              (x) =>
                `<div class="qi ${x.id === cu.id ? "sel" : ""} ${selectedQuestionIds.has(x.id) ? "bulk-selected" : ""} ${G.used?.includes(x.id) ? "used" : ""}" onclick="tabSel='play';sel('${x.id}')">${withActions ? `<input class="question-selection" type="checkbox" aria-label="تحديد السؤال للحذف" ${selectedQuestionIds.has(x.id) ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleQuestionSelection('${x.id}',this.checked)">` : ""}<span class="qt">${esc(x.x)}</span>${duplicates.has(x.id) ? '<span class="bdg duplicate" title="يتكرر نص السؤال">مكرر</span>' : ""}<span class="bdg ${x.kind === "reverse" ? "rev" : x.d === "h" ? "hard" : "easy"}">${x.kind === "reverse" ? "معكوسة" : x.kind === "career" ? "مسيرة لاعب" : x.d === "h" ? "صعب" : "سهل"}</span>${withActions ? `<button class="icon" title="تعديل" aria-label="تعديل" onclick="event.stopPropagation();openForm('${x.id}')"><img class="action-icon" src="/assets/icons/edit-svgrepo-com.svg" alt=""></button><button class="icon danger" title="حذف" aria-label="حذف السؤال" onclick="event.stopPropagation();del('${x.id}')"><img class="action-icon" src="/assets/icons/icons8-trash.svg" alt=""></button>` : ""}</div>`,
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
            (question.kind === "visual" && key === "خمنالصورة") ||
            (question.kind === "career" && key === "ميناللاعب")
          )
            return;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(question.id);
        });
        return new Set(
          [...groups.values()].filter((ids) => ids.length > 1).flat(),
        );
      }
      function toggleQuestionSelection(id, checked) {
        if (checked) selectedQuestionIds.add(id);
        else selectedQuestionIds.delete(id);
        render();
      }
      function toggleVisibleQuestionSelection() {
        const select = !visibleManageQuestionIds.every((id) =>
          selectedQuestionIds.has(id),
        );
        visibleManageQuestionIds.forEach((id) => {
          if (select) selectedQuestionIds.add(id);
          else selectedQuestionIds.delete(id);
        });
        render();
      }
      function clearQuestionSelection() {
        selectedQuestionIds.clear();
        render();
      }
      async function deleteSelectedQuestions() {
        const ids = [...selectedQuestionIds];
        if (!ids.length) return;
        if (
          !(await askConfirm(
            `سيتم حذف ${ids.length} سؤالًا نهائيًا. هل تريد المتابعة؟`,
            "حذف الأسئلة المحددة",
            "حذف الأسئلة",
          ))
        )
          return;
        try {
          const result = await api("/api/questions/bulk-delete", "DELETE", {
            ids,
          });
          if (!result.deleted) {
            selectedQuestionIds.clear();
            render();
            return toast("لم يتم العثور على الأسئلة المحددة", 1);
          }
          const deletedIds = new Set(ids);
          selectedQuestionIds.clear();
          G.used = (G.used || []).filter((id) => !deletedIds.has(id));
          if (deletedIds.has(G.cur.id))
            G.cur = {
              id: null,
              q: 0,
              o: 0,
              a: 0,
              buz: null,
              res: null,
              visualClarity: 0,
            };
          save();
          toast(
            result.deleted === ids.length
              ? `تم حذف ${result.deleted} سؤال`
              : `تم حذف ${result.deleted} من ${ids.length} سؤال`,
          );
        } catch (error) {
          toast(error.message, 1);
        }
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
              ...(question.clubs || []).map((club) => club.n),
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
        openFilterMenu = null;
        if (filter === "difficulty") questionDifficulty = value;
        else if (filter === "kind") questionKind = value;
        else duplicateQuestionsOnly = value;
        render();
      }
      function clearQuestionFilter(filter) {
        if (filter === "search") questionSearch = "";
        else if (filter === "difficulty") questionDifficulty = "all";
        else if (filter === "kind") questionKind = "all";
        else if (filter === "duplicates") duplicateQuestionsOnly = false;
        render();
      }
      function resetQuestionFilters() {
        questionSearch = "";
        questionDifficulty = "all";
        questionKind = "all";
        duplicateQuestionsOnly = false;
        openFilterMenu = null;
        render();
      }
      function toggleFilterMenu(name) {
        openFilterMenu = openFilterMenu === name ? null : name;
        render();
      }
      function closeFilterMenu() {
        if (!openFilterMenu) return;
        const menuWasVisible = !!document.querySelector(".fdd.open");
        openFilterMenu = null;
        if (menuWasVisible) render();
      }
      function filterDropdownHTML(name, label, options, current) {
        const open = openFilterMenu === name,
          cur = options.find((o) => o.v === current) || options[0],
          title = name === "kind" ? "نوع السؤال" : "الصعوبة";
        return `<div class="fdd ${open ? "open" : ""}" data-filter="${name}"><button type="button" class="fdd-btn" aria-haspopup="listbox" aria-expanded="${open}" aria-label="${label}" onclick="event.stopPropagation();toggleFilterMenu('${name}')"><span class="fdd-label">${title}</span><span class="fdd-value">${cur.l}</span><i class="fdd-caret" aria-hidden="true"></i></button>${open ? `<div class="fdd-menu" role="listbox" aria-label="${label}" onclick="event.stopPropagation()"><div class="fdd-menu-head"><strong>اختر ${title}</strong><small>اختيار واحد</small></div><div class="fdd-options">${options.map((o) => `<div class="fdd-opt ${o.v === current ? "sel" : ""}" role="option" tabindex="0" aria-selected="${o.v === current}" onclick="event.stopPropagation();updateQuestionFilter('${name}','${o.v}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();updateQuestionFilter('${name}','${o.v}')}"><span class="fdd-ico" aria-hidden="true">${o.i || "☷"}</span><span class="fdd-opt-label">${o.l}</span><i class="fdd-radio" aria-hidden="true"></i></div>`).join("")}</div></div>` : ""}</div>`;
      }
      document.addEventListener("click", closeFilterMenu);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && openFilterMenu) {
          closeFilterMenu();
        }
      });
      function emptyHTML() {
        if (!Qs.length)
          return `<div class="card empty"><div class="big">ابدأ بإضافة أول سؤال</div><p>الأسئلة والتصنيفات بتتعمل من عندك. أضف سؤالًا جديدًا أو استورد ملف أسئلة جاهزًا.</p><div class="row c"><button class="primary" onclick="openForm()">＋ سؤال جديد</button><button onclick="$('importQuestionsFile').click()">⬆ استيراد أسئلة</button></div></div>`;
        return `<div class="card empty"><div class="big">اختر سؤالًا للبدء</div><p>اضغط «السؤال التالي» أو «عشوائي» من الشريط السفلي، أو اختر سؤالًا بعينه من القائمة.</p></div>`;
      }
      function questionCardHTML(c) {
        const { q, cu, top, reverse, career, clubIndex } = c;
        if (!q) return emptyHTML();
        const reveal = top
          ? `<div class="reveal">${q.r.map((a, i) => `<button class="${cu.revealed?.includes(i) ? "on" : ""}" onclick="revealRank(${i})">${cu.revealed?.includes(i) ? "تم كشف" : "كشف"} رقم ${i + 1}</button>`).join("")}</div>`
          : "";
        const availablePoints =
          q.kind === "visual" && q.image && q.blurEnabled === true
            ? visualQuestionPoints(q.d, visualClarityLevel(cu))
            : pts(q);
        return `<div class="card qcard"><div class="qhead"><span class="bdg">${esc(q.t)}</span><span class="mut">${q.kind === "visual" && q.image && q.blurEnabled === true ? `${availablePoints} نقطة متبقية` : `${pts(q)} نقطة`}</span>${reverse ? '<span class="bdg rev">كلمة معكوسة</span>' : ""}${career ? '<span class="bdg">مسيرة لاعب</span>' : ""}<span class="sp"></span><span class="mut note">معاينة · لا تظهر على الشاشة</span><button class="icon" title="تعديل السؤال" aria-label="تعديل السؤال" onclick="openForm('${q.id}')"><img class="action-icon" src="/assets/icons/edit-svgrepo-com.svg" alt=""></button><button class="icon danger" title="حذف السؤال" aria-label="حذف السؤال" onclick="del('${q.id}')"><img class="action-icon" src="/assets/icons/icons8-trash.svg" alt=""></button></div><div class="qtext">${esc(q.x)}</div>${previewHTML(c)}${reveal}</div>`;
      }
      function timerHTML(c) {
        const { timer, timerActive } = c;
        return `<div class="timer-controls"><div class="game-timer"><div class="timer-readout"><span>${timerPhaseLabel(timer.phase)}${timer.paused ? " · متوقف" : ""}</span><b id="tabletTimerCountdown">${timerSeconds(timer)}</b><small>ثانية</small></div><div class="timer-track"><i id="tabletTimerProgress" style="width:${timerProgress(timer)}%"></i></div></div><button onclick="${timerActive ? "toggleTimer()" : "restartTimer()"}">${timerActive ? (timer.paused ? "▶ استكمال المؤقت" : "⏸ إيقاف المؤقت") : "↻ إعادة المؤقت"}</button>${timerActive ? `<button onclick="restartTimer()">↻ إعادة 30 ثانية</button>` : ""}</div>`;
      }
      function audioHTML(c) {
        const { q, cu } = c,
          provider = embeddedAudioProvider(q.audioUrl),
          playback =
            audioPlaybackState?.displayId === cu.displayId
              ? audioPlaybackState
              : null;
        const timeLabel = (seconds) => {
          const value = Math.max(0, Math.floor(seconds || 0));
          return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
        };
        const progressHTML =
          playback?.duration > 0
            ? `<div class="audio-seek-control"><div class="audio-seek-times"><span id="questionAudioPosition">${timeLabel(playback.position)}</span><span>${timeLabel(playback.duration)}</span></div><input id="questionAudioSeek" aria-label="تقديم أو إرجاع الصوت" type="range" min="0" max="${playback.duration}" step="1" value="${Math.min(playback.duration, playback.position)}" oninput="$('questionAudioPosition').textContent=(Math.floor(this.value/60))+':'+String(Math.floor(this.value%60)).padStart(2,'0')" onchange="setQuestionAudio('seek',this.value)"></div>`
            : "";
        const playbackButton =
          playback?.paused ?? cu.audioControl?.playing === false
            ? "play"
            : "pause";
        if (provider === "spotify" || provider === "youtube")
          return `<div class="card audio-control-panel"><h3>التحكم في صوت السؤال</h3><div class="row"><button id="questionAudioPlayToggle" class="big2 on" onclick="setQuestionAudio('${playbackButton}')">${playbackButton === "play" ? "▶ تشغيل الصوت" : "⏸ إيقاف مؤقت"}</button><button class="big2" onclick="setQuestionAudio('restart')">↺ إعادة من البداية</button></div>${progressHTML}${provider === "spotify" && !playback?.duration ? "<small>سيظهر شريط الوقت إذا أتاح Spotify مدة المقطع؛ قد لا يدعم التقديم لبعض الأغاني.</small>" : ""}${provider === "spotify" ? "<small>مستوى الصوت من مشغّل Spotify على شاشة العرض.</small>" : `<label for="questionAudioVolume">مستوى الصوت: <span id="questionAudioVolumeValue">${Math.round((cu.audioControl?.volume ?? 1) * 100)}%</span></label><input id="questionAudioVolume" type="range" min="0" max="100" value="${Math.round((cu.audioControl?.volume ?? 1) * 100)}" oninput="$('questionAudioVolumeValue').textContent=this.value+'%'" onchange="setQuestionAudio('volume',this.value/100)">`}</div>`;
        if (provider && provider !== "youtube")
          return `<div class="card audio-control-panel"><h3>التحكم في صوت السؤال</h3><small>استخدم أزرار مشغّل SoundCloud على شاشة العرض للتحكم في الصوت.</small></div>`;
        return `<div class="card audio-control-panel"><h3>التحكم في صوت السؤال</h3><div class="row"><button id="questionAudioPlayToggle" class="big2 on" onclick="setQuestionAudio('${playbackButton}')">${playbackButton === "play" ? "▶ تشغيل الصوت" : "⏸ إيقاف مؤقت"}</button><button class="big2" onclick="setQuestionAudio('restart')">↺ إعادة من البداية</button></div>${progressHTML}<label for="questionAudioVolume">مستوى الصوت: <span id="questionAudioVolumeValue">${Math.round((cu.audioControl?.volume ?? 1) * 100)}%</span></label><input id="questionAudioVolume" type="range" min="0" max="100" value="${Math.round((cu.audioControl?.volume ?? 1) * 100)}" oninput="$('questionAudioVolumeValue').textContent=this.value+'%'" onchange="setQuestionAudio('volume',this.value/100)"><small>إذا منع المتصفح التشغيل عن بُعد، اضغط تشغيل على شاشة العرض مرة واحدة.</small></div>`;
      }
      function updateAudioPlaybackState(state) {
        audioPlaybackState = state;
        if (!state || state.displayId !== G?.cur?.displayId) return;
        const slider = $("questionAudioSeek"),
          position = $("questionAudioPosition");
        if (state.duration > 0 && !slider) {
          render();
          return;
        }
        if (slider && document.activeElement !== slider) {
          slider.max = String(state.duration);
          slider.value = String(Math.min(state.duration, state.position));
        }
        if (position && document.activeElement !== slider) {
          const seconds = Math.floor(state.position || 0);
          position.textContent = `${Math.floor(seconds / 60)}:${String(
            seconds % 60,
          ).padStart(2, "0")}`;
        }
        const button = $("questionAudioPlayToggle");
        if (button) {
          button.textContent = state.paused ? "▶ تشغيل الصوت" : "⏸ إيقاف مؤقت";
          button.setAttribute(
            "onclick",
            `setQuestionAudio('${state.paused ? "play" : "pause"}')`,
          );
        }
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
        const visualPenalty =
            q?.kind === "visual" && q.image && q.blurEnabled === true
              ? pts(q) - visualQuestionPoints(q.d, visualClarityLevel(cu))
              : 0,
          correctPoints = Math.max(0, pts(q) - visualPenalty),
          grade =
          cu.buz != null
            ? `<div class="row grade">${top && cu.rank == null ? "<small>اكشف ترتيب الإجابة لتسجيل نقاطها</small>" : `<button class="big2 ok" onclick="grade(1${top ? `,${cu.rank}` : ""})">✅ صح (+${top ? cu.rank + 1 : correctPoints})</button>`}<button class="big2 no" onclick="grade(0)">❌ غلط (−1)</button></div>${cu.res ? `<small class="res ${cu.res}">تم التسجيل: ${cu.res === "ok" ? "صح" : "غلط"}</small>` : ""}`
            : "";
        return `<div class="card who"><h3>من جاوب؟</h3><div class="chips">${chips}</div>${G.mode === "rounds" && !eligiblePlayers.length ? "<small>اختر أو أنشئ جولة وحدد المشاركين أولًا.</small>" : ""}${grade}</div>`;
      }
      function dockHTML(c) {
        const { q, cu, hasO, top, reverse, visual, career, reverseCount, reverseIndex } = c;
        const nav = `<div class="dock-nav"><button class="primary" onclick="nextQ()">السؤال التالي ‹</button><button onclick="rndQ()"><img class="action-icon" src="/assets/icons/random.svg" alt=""> عشوائي</button></div>`;
        if (!q || !Qs.length) return `<div class="dock">${nav}</div>`;
        const show = career
          ? `<button class="big2 ${cu.q ? "on" : ""}" onclick="tg('q')">${cu.q ? "إخفاء المسيرة" : "عرض مسيرة الأندية"}</button>${cu.q ? `<button class="big2 on" onclick="nextCareerClub()" ${cu.clubIndex >= q.clubs.length - 1 ? "disabled" : ""}>${cu.clubIndex >= q.clubs.length - 1 ? "اكتملت الأندية" : `إظهار النادي التالي (${cu.clubIndex + 2}/${q.clubs.length})`}</button><button class="big2 ${cu.a ? "on" : ""}" onclick="tg('a')">${cu.a ? "إخفاء الإجابة" : "كشف اللاعب"}</button>` : ""}`
          : reverse
          ? `<button class="big2 on" onclick="nextReverseLetter()" ${reverseIndex >= reverseCount ? "disabled" : ""}>${reverseIndex >= reverseCount ? "اكتملت الحروف" : `إظهار الحرف التالي (${reverseIndex + 1}/${reverseCount})`}</button><button class="big2" onclick="resetReverse()">ابدأ من جديد</button>`
          : `<button class="big2 ${cu.q ? "on" : ""}" onclick="tg('q')">${cu.q ? "إخفاء" : "عرض"} السؤال</button>${hasO ? `<button class="big2 ${cu.o ? "on" : ""}" onclick="tg('o')">${cu.o ? "إخفاء" : "عرض"} الاختيارات</button>` : ""}${top ? "" : `<button class="big2 ${cu.a ? "on" : ""}" onclick="tg('a')">${cu.a ? "إخفاء" : "عرض"} الإجابة</button>`}`;
        const clarity = visualClarityLevel(cu),
          visualClarityButton =
            visual && q.image && q.blurEnabled === true && cu.q && !cu.a
              ? `<button class="big2 visual-clarity-button" onclick="clarifyVisual()" ${clarity >= MAX_VISUAL_CLARITY ? "disabled" : ""}>${clarity >= MAX_VISUAL_CLARITY ? "الصورة واضحة بالكامل" : `وضّح أكتر · ${clarity < pts(q) ? "خصم نقطة" : "بدون خصم إضافي"} (${clarity}/${MAX_VISUAL_CLARITY})`}</button>`
              : "";
        return `<div class="dock">${nav}<div class="dock-show">${show}${visualClarityButton}</div></div>`;
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
          allVisibleSelected =
            filtered.length > 0 &&
            filtered.every((question) =>
              selectedQuestionIds.has(question.id),
            ),
          kindLabels = {
            normal: "عادي",
            audio: "صوتي",
            top5: "توب 5",
            top10: "توب 10",
            reverse: "معكوسة",
            visual: "بصري",
            career: "مسيرة لاعب",
          };
        const kindIcons = {
            all: "☷",
            normal: "📝",
            audio: "🎵",
            top5: "🏆",
            top10: "🏆",
            reverse: "🔄",
            visual: "🖼️",
            career: "⚽",
          },
          kindOptions = [
            { v: "all", l: "كل الأنواع", i: kindIcons.all },
            ...Object.entries(kindLabels).map(([v, l]) => ({
              v,
              l,
              i: kindIcons[v],
            })),
          ],
          diffOptions = [
            { v: "all", l: "كل الصعوبات", i: "☷" },
            {
              v: "e",
              l: "سهل",
              i: '<span class="fdd-dot e"></span>',
            },
            {
              v: "h",
              l: "صعب",
              i: '<span class="fdd-dot h"></span>',
            },
          ],
          activeFilters = [];
        if (questionSearch.trim())
          activeFilters.push({
            key: "search",
            label: `بحث: ${questionSearch.trim()}`,
          });
        if (questionKind !== "all")
          activeFilters.push({
            key: "kind",
            label: kindLabels[questionKind] || questionKind,
          });
        if (questionDifficulty !== "all")
          activeFilters.push({
            key: "difficulty",
            label: questionDifficulty === "e" ? "سهل" : "صعب",
          });
        if (duplicateQuestionsOnly)
          activeFilters.push({ key: "duplicates", label: "المكررة فقط" });
        const activeFiltersHTML = `<div class="active-filters"><span class="active-filters-title">الفلاتر النشطة</span><div class="filter-chips">${activeFilters.length ? activeFilters
          .map(
            (filter) =>
              `<button type="button" class="filter-chip" onclick="clearQuestionFilter('${filter.key}')">${esc(filter.label)} <b aria-hidden="true">×</b></button>`,
          )
          .join("") : '<span class="no-active-filters">لا توجد فلاتر نشطة</span>'}</div>${activeFilters.length ? '<button type="button" class="reset-filters" onclick="resetQuestionFilters()">إعادة ضبط الكل</button>' : ""}</div>`;
        visibleManageQuestionIds = filtered.map((question) => question.id);
        return `<div class="mg"><div class="card"><h3 class="q-title">الأسئلة <span class="q-badge">${Qs.length} سؤال</span><span class="q-badge dim">${duplicates.size} مكرر</span></h3><div class="row"><button class="primary" onclick="openForm()">＋ سؤال جديد</button><button onclick="$('importQuestionsFile').click()">⬆ استيراد</button><button onclick="exportQuestions()">⬇ تصدير</button></div><section class="filter-panel"><div class="filter-panel-head"><div><strong>تصفية الأسئلة</strong><small>اجمع بين البحث والنوع والصعوبة للوصول للسؤال بسرعة</small></div><span class="filter-result-count">${filtered.length} نتيجة</span></div><div class="question-filters"><input id="questionSearch" type="search" aria-label="بحث في الأسئلة" placeholder="ابحث في نص السؤال والإجابة والاختيارات" value="${esc(questionSearch)}" oninput="updateQuestionSearch(this.value)">${filterDropdownHTML("difficulty", "تصفية حسب الصعوبة", diffOptions, questionDifficulty)}${filterDropdownHTML("kind", "تصفية حسب النوع", kindOptions, questionKind)}<label class="duplicate-filter"><input type="checkbox" ${duplicateQuestionsOnly ? "checked" : ""} onchange="updateQuestionFilter('duplicates',this.checked)"> المكررة فقط</label></div>${activeFiltersHTML}</section><div class="row question-bulk-actions"><button onclick="toggleVisibleQuestionSelection()" ${filtered.length ? "" : "disabled"}>${allVisibleSelected ? "إلغاء تحديد المعروض" : "تحديد المعروض"}</button><button onclick="clearQuestionSelection()" ${selectedQuestionIds.size ? "" : "disabled"}>إلغاء التحديد</button><button class="danger" onclick="deleteSelectedQuestions()" ${selectedQuestionIds.size ? "" : "disabled"}>🗑 حذف المحدد (${selectedQuestionIds.size})</button><span class="filter-count">عرض ${filtered.length} من ${list.length} في التصنيف المختار</span><small>«تحديد المعروض» يحدد نتائج الفلاتر الحالية فقط.</small></div><details class="import-hint"><summary>طريقة تجهيز ملف الاستيراد</summary><small class="import-hint">استيراد: نسخة JSON، أو TXT/Word (DOCX) بأسطر معنونة، أو Excel (XLSX) بصف عناوين: التصنيف، السؤال، الصعوبة، الاختيار أ، الاختيار ب، الاختيار ج، الاختيار د، الإجابة.</small><div dir="rtl" class="sample">التصنيف: ثقافة عامة<br>السؤال: ما عاصمة مصر؟<br>الصعوبة: سهل<br>الاختيار أ: القاهرة<br>الاختيار ب: الإسكندرية<br>الاختيار ج: الجيزة<br>الاختيار د: الأقصر<br>الإجابة: أ</div><small>افصل كل سؤال عن التالي بسطر فارغ. يمكن ترك الاختيارات والصعوبة فارغة؛ والإجابة تكون نصًا إن لم توجد اختيارات.</small></details>${T.length > 1 ? catsHTML(T) : ""}${qListHTML(filtered, cu, true, duplicates, "لا توجد أسئلة مطابقة للفلاتر")}</div><div class="card"><h3>الثيم والوضع</h3><p class="theme-description">اختار الألوان المناسبة لك. الثيم بيتحفظ على هذا الجهاز والمتصفح.</p>${themeOptionsHTML()}</div><div class="card"><h3>المؤثرات الصوتية</h3><div class="row"><button id="tabletSfxToggle" class="tablet-sfx-toggle ${sfxEnabled ? "on" : ""}" aria-pressed="${sfxEnabled}" onclick="toggleSfx('tabletSfxToggle')">${sfxEnabled ? "🔊 كتم المؤثرات" : "🔇 تفعيل المؤثرات"}</button></div></div><div class="card"><h3>الحساب</h3><div class="row"><button class="danger" onclick="logout()">🚪 خروج</button></div></div></div>`;
      }
      const TIMER_DURATION = 30000;
      function timerEnabled(q) {
        return q && ["normal", "visual", "audio", "top5", "top10", "career"].includes(q.kind);
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
        advanceGameVersion();
        render();
        persistGame("تعذر الاتصال بالسيرفر");
      }
      function setQuestionAudio(action, volume = null) {
        const current = G?.cur?.audioControl || {
          seq: 0,
          playing: true,
          volume: 1,
        };
        const requestedPosition = Number(volume);
        if (action === "seek" && !Number.isFinite(requestedPosition))
          return toast("موضع الصوت غير صالح", 1);
        if (action === "seek" && audioPlaybackState?.displayId === G.cur.displayId)
          audioPlaybackState = {
            ...audioPlaybackState,
            position: Math.min(
              audioPlaybackState.duration,
              Math.max(0, requestedPosition),
            ),
          };
        if (audioPlaybackState?.displayId === G.cur.displayId) {
          if (action === "pause") audioPlaybackState.paused = true;
          else if (action === "play" || action === "restart")
            audioPlaybackState.paused = false;
        }
        G.cur.audioControl = {
          seq: (current.seq || 0) + 1,
          action,
          playing:
            action === "pause"
              ? false
              : action === "play" || action === "restart"
                ? true
                : current.playing !== false,
          position:
            action === "seek"
              ? Math.min(
                  audioPlaybackState?.duration || requestedPosition,
                  Math.max(0, requestedPosition),
                )
              : current.position,
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
            x:
              question.kind === "reverse"
                ? "كلمة معكوسة"
                : question.kind === "career"
                  ? "مسيرة لاعب ⚽"
                  : question.x,
          });
          offset += 55 + i * 22;
        }
        frames.push({
          at: offset,
          t: chosen.t,
          x:
            chosen.kind === "reverse"
              ? "كلمة معكوسة"
              : chosen.kind === "career"
                ? "مسيرة لاعب ⚽"
                : chosen.x,
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
          clubIndex: show ? 0 : -1,
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
      function clarifyVisual() {
        const q = cq(),
          clarity = visualClarityLevel();
        if (
          !G.cur.q ||
          G.cur.a ||
          q?.kind !== "visual" ||
          !q.image ||
          q.blurEnabled !== true
        )
          return;
        if (clarity >= MAX_VISUAL_CLARITY)
          return toast("الصورة أصبحت واضحة بالكامل");
        G.cur.visualClarity = clarity + 1;
        save();
        toast(
          clarity < pts(q)
            ? "تم توضيح الصورة — ستُخصم نقطة عند الإجابة الصحيحة"
            : "تم توضيح الصورة بدون خصم إضافي",
        );
      }
      function nextCareerClub() {
        const q = cq();
        if (!q || q.kind !== "career" || !G.cur.q) return;
        const index = Number.isInteger(G.cur.clubIndex) ? G.cur.clubIndex : -1;
        if (index >= q.clubs.length - 1)
          return toast("تم كشف كل الأندية", 1);
        G.cur.clubIndex = index + 1;
        save();
      }
      function tg(k) {
        G.cur[k] = +!G.cur[k];
        if (k === "q" && !G.cur.q) {
          G.cur.o = G.cur.a = 0;
          G.cur.roulette = null;
          G.cur.timer = null;
          G.cur.clubIndex = -1;
        } else if (k === "q") {
          if (cq()?.kind === "career") G.cur.clubIndex = 0;
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
        const clarityPenalty =
            ok &&
            q?.kind === "visual" &&
            q.image &&
            q.blurEnabled === true
              ? pts(q) - visualQuestionPoints(q.d, visualClarityLevel())
              : 0,
          key = top && ok ? `${G.cur.buz}:${rank}` : null;
        if (key && G.cur.awards?.includes(key))
          return toast("تم احتساب نقاط هذا الترتيب للاعب", 1);
        recordPointUndo("grade");
        playSfx(ok ? "correct" : "wrong");
        const contestant = players[G.cur.buz];
        const delta = ok
          ? top
            ? rank + 1
            : Math.max(0, pts(q) - clarityPenalty)
          : -1;
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
        else if (clarityPenalty) recordPointDeduction(contestant, clarityPenalty);
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
        const podiumEntries = rankedContestants.sort((a, b) => b.score - a.score).slice(0, 3),
          podiumOrder = [podiumEntries[1], podiumEntries[0], podiumEntries[2]].filter(Boolean),
          podium = podiumEntries.length
            ? `<div class="stats-podium" data-count="${podiumEntries.length}" role="list" aria-label="أفضل المتسابقين بالنقاط">${podiumOrder
                .map((entry) => {
                  const rank = podiumEntries.indexOf(entry) + 1,
                    rankName = ["", "المركز الأول", "المركز الثاني", "المركز الثالث"][rank],
                    height = [0, 116, 84, 64][rank];
                  return `<div class="stats-podium-item stats-rank-${rank}" role="listitem"><b class="stats-podium-name">${esc(entry.contestant.n)}</b><div class="stats-podium-block" style="height:${height}px"><strong>${rank}</strong><span>${entry.score} نقطة</span></div><span class="stats-sr-only">${rankName}</span></div>`;
                })
                .join("")}</div>`
            : '<div class="stats-empty">لا يوجد متسابقون مسجلون.</div>';
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
                return `<article class="stats-player" role="listitem"><div class="stats-player-head"><b>${esc(contestant.n)}</b><span>دقة الإجابة ${playerAccuracy}%</span></div><div class="stats-progress" role="progressbar" aria-label="دقة إجابة ${esc(contestant.n)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${playerAccuracy}"><span style="width:${playerAccuracy}%"></span></div><div class="stats-player-values"><span class="stats-value stats-correct">صح <b>${playerCorrect}</b></span><span class="stats-value stats-wrong">خطأ <b>${playerWrong}</b></span><span class="stats-value stats-deductions">مخصوم <b>${playerDeductions}</b></span><span class="stats-value">الإجمالي <b>${playerAnswered}</b></span></div>${categoryPerformanceHTML(contestant)}</article>`;
              })
              .join("")
          : '<div class="stats-empty">لا يوجد متسابقون مسجلون.</div>';
        $("statsModal").innerHTML =
          `<div class="modal stats-modal" onclick="if(event.target===this)closeStats()"><section class="card stats-card" role="dialog" aria-modal="true" aria-labelledby="statsTitle"><header class="stats-header"><div><h3 id="statsTitle">إحصائيات الإجابات</h3><p>ملخص أداء المتسابقين في هذه المسابقة</p></div><button type="button" class="stats-close" aria-label="إغلاق إحصائيات الإجابات" onclick="closeStats()">إغلاق</button></header><div class="stats-grid stats-primary-grid"><div class="stats-item stats-correct"><span>إجابات صحيحة</span><b>${correct}</b></div><div class="stats-item stats-wrong"><span>إجابات خاطئة</span><b>${wrong}</b></div><div class="stats-item"><span>إجمالي الإجابات</span><b>${answered}</b></div></div><div class="stats-grid stats-secondary-grid"><div class="stats-item stats-info-item"><span>نسبة الإجابات الصحيحة</span><b>${accuracy}%</b></div><div class="stats-item stats-deductions"><span>إجمالي النقاط المخصومة</span><b>${deductedPoints}</b></div></div><section class="stats-section"><h3 class="stats-subtitle">أفضل المتسابقين بالنقاط</h3>${podium}</section><section class="stats-section stats-players-section"><h3 class="stats-subtitle">إحصائيات كل متسابق</h3><div class="stats-players" role="list">${contestants}</div></section><div class="stats-actions"><button type="button" class="stats-show-button" onclick="toggleStatsOnScreen()">${G.showStats ? "إخفاء الإحصائيات من شاشة العرض" : "إظهار الإحصائيات على شاشة العرض"}</button><button type="button" class="stats-reset-button" onclick="resetStats()">إعادة تسجيل الإحصائيات</button></div><small class="stats-note">إعادة التسجيل تصفّر الإحصائيات فقط ولا تغيّر النقاط. أداء الفئات يُسجل من الإجابات الجديدة، وتظهر المقارنة بعد إجابتين في الفئة.</small></section></div>`;
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
          if (
            G.cs.some(
              (player) =>
                player.n.toLocaleLowerCase() === n.toLocaleLowerCase(),
            )
          )
            return toast("هذا المتسابق موجود بالفعل في المسابقة الحرة", 1);
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
          selectedQuestionIds.delete(id);
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
      const KIND_META = {
        normal: { icon: "📝", name: "سؤال عادي", desc: "اختيارات أو إجابة نصية", color: "#3b82f6" },
        audio: { icon: "🎧", name: "سؤال صوتي", desc: "مقطع صوتي من رابط أو ملف", color: "#a78bfa" },
        top5: { icon: "🏆", name: "توب 5", desc: "٥ إجابات مرتبة", color: "#f59e0b" },
        top10: { icon: "🥇", name: "توب 10", desc: "١٠ إجابات مرتبة", color: "#f97316" },
        reverse: { icon: "🔄", name: "كلمات معكوسة", desc: "كلمة تظهر حرفًا بحرف", color: "#14b8a6" },
        visual: { icon: "🖼️", name: "خمن الصورة", desc: "صورة أو إيموجي للتخمين", color: "#ec4899" },
        career: { icon: "⚽", name: "مسيرة لاعب", desc: "شعارات أندية اللاعب", color: "#22c55e" },
      };
      function segHTML(selectId, items, current) {
        return `<div class="seg" role="radiogroup" data-for="${selectId}">${items
          .map(([v, label]) => `<button type="button" class="seg-b ${v === current ? "on" : ""}" role="radio" aria-checked="${v === current}" data-v="${v}" onclick="pickSeg('${selectId}','${v}')">${label}</button>`)
          .join("")}</div>`;
      }
      function pickSeg(selectId, value) {
        $(selectId).value = value;
        document.querySelectorAll(`#form .seg[data-for="${selectId}"] .seg-b`).forEach((b) => {
          const on = b.dataset.v === value;
          b.classList.toggle("on", on);
          b.setAttribute("aria-checked", on);
        });
        updateQuestionPreview();
      }
      function categoryChipsHTML(current) {
        const counts = {};
        Qs.forEach((q) => { if (q.t) counts[q.t] = (counts[q.t] || 0) + 1; });
        const cats = Object.keys(counts);
        if (!cats.length) return "";
        return `<div class="cchips" role="group" aria-label="التصنيفات الموجودة">${cats
          .map((t) => `<button type="button" class="cchip ${t === current ? "on" : ""}" data-cat="${esc(t)}" onclick="pickCategory(this.dataset.cat)">${esc(t)}<span>${counts[t]}</span></button>`)
          .join("")}</div>`;
      }
      function syncCategoryChips() {
        const v = $("ft").value.trim();
        document.querySelectorAll("#form .cchip").forEach((b) => b.classList.toggle("on", b.dataset.cat === v));
      }
      function pickCategory(cat) {
        $("ft").value = cat;
        syncCategoryChips();
        updateQuestionPreview();
      }
      function kindPickerHTML(current) {
        const short = { reverse: "معكوسة", visual: "صورة" };
        const counts = Object.create(null);
        Qs.forEach((question) => {
          const kind = question.kind || "normal";
          counts[kind] = (counts[kind] || 0) + 1;
        });
        return `<div class="ktypes" role="radiogroup" aria-label="نوع السؤال">${Object.entries(KIND_META)
          .map(([k, m]) => {
            const n = counts[k] || 0;
            return `<button type="button" class="ktype ${k === current ? "on" : ""}" data-kind="${k}" role="radio" aria-checked="${k === current}" title="${m.desc} · ${n} سؤال" style="--k:${m.color}" onclick="pickQuestionKind('${k}')"><span class="kt-ic" aria-hidden="true">${m.icon}</span><span class="kt-name">${short[k] || m.name.replace("سؤال ", "")}</span></button>`;
          })
          .join("")}</div>`;
      }
      function pickQuestionKind(kind) {
        $("fk").value = kind;
        document.querySelectorAll("#form .ktype").forEach((b) => {
          const on = b.dataset.kind === kind;
          b.classList.toggle("on", on);
          b.setAttribute("aria-checked", on);
        });
        toggleQuestionKind();
      }
      function updateQuestionPreview() {
        const box = $("qfPreview");
        if (!box || !$("fk") || !$("fd") || !$("ft")) return;
        const kind = $("fk").value,
          meta = KIND_META[kind] || KIND_META.normal,
          hard = $("fd").value === "h",
          cat = $("ft").value.trim(),
          val = (id) => ($(id)?.value || "").trim(),
          isImg = (u) => validClubImage(u || "");
        let title = "",
          hint = "",
          extra = "",
          note = "";
        if (kind === "career") {
          syncCareerClubFields();
          title = val("fca") || "اسم اللاعب";
          hint = "مين اللاعب؟";
          extra = `<div class="pv-logos">${questionClubs
            .map((c) => (isImg(c.image) ? `<img src="${esc(c.image)}" alt="">` : `<span class="pv-lg${c.n ? "" : " empty"}">${esc((c.n || "?").slice(0, 2))}</span>`))
            .join("")}</div>`;
          note = questionClubs.filter((c) => c.n || c.image).length >= 2 ? "السؤال مكتمل" : "سؤال مكتمل بعد ناديين على الأقل";
        } else if (kind === "top5" || kind === "top10") {
          const total = kind === "top10" ? 10 : 5,
            filled = Array.from({ length: total }, (_, i) => val("fr" + i)).filter(Boolean);
          title = val("fx") || "نص السؤال";
          extra = `<ol class="pv-list">${filled.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>`;
          note = `${filled.length} من ${total} إجابات`;
        } else if (kind === "reverse") {
          title = val("frw") || "الكلمة الأصلية";
          hint = "تظهر معكوسة حرفًا بحرف";
        } else if (kind === "visual") {
          title = val("fvp") || "نص السؤال";
          if (val("fva")) hint = "الإجابة: " + val("fva");
          const em = val("fe");
          const imageUrl = val("fi");
          $("visualBlurToggle").hidden = !imageUrl;
          extra = isImg(imageUrl) ? `<img class="pv-img" src="${esc(imageUrl)}" alt="" style="filter:blur(${questionBlurEnabled ? 16 : 0}px)">` : em ? `<div class="pv-emoji">${esc(em)}</div>` : "";
        } else {
          title = val("fx") || "نص السؤال";
          const opts = [0, 1, 2, 3].map((i) => val("fo" + i));
          if (opts.some(Boolean)) {
            const ci = Number($("fc").value);
            extra = `<ul class="pv-opts">${opts.map((o, i) => (o ? `<li class="${i === ci ? "ok" : ""}"><b>${LB[i]}</b> ${esc(o)}</li>` : "")).join("")}</ul>`;
          } else if (val("fa")) hint = "الإجابة: " + val("fa");
          if (kind === "audio") note = val("fau") || $("fauFile")?.files?.length ? "المقطع الصوتي جاهز" : "أضف رابطًا أو ملفًا صوتيًا";
        }
        box.innerHTML = `<small>معاينة حية</small><div class="pv-chips"><span class="pv-chip" style="--k:${meta.color}">${meta.icon} ${esc(meta.name.replace("سؤال ", ""))}</span><span class="pv-chip ${hard ? "h" : "e"}">${hard ? "صعب" : "سهل"}</span>${cat ? `<span class="pv-chip dim">${esc(cat)}</span>` : ""}</div><div class="pv-title">${esc(title)}</div>${hint ? `<small>${esc(hint)}</small>` : ""}${extra}${note ? `<small class="pv-note">${esc(note)}</small>` : ""}`;
      }
      function openForm(id) {
        const e = Qs.find((x) => x.id === id) || {
          o: [],
          r: [],
          kind: KIND_META[questionKind] ? questionKind : "normal",
          d: "e",
          t: G.f !== "الكل" ? G.f : "",
        };
        questionBlurEnabled = e.blurEnabled === true;
        questionClubs =
          e.kind === "career" && Array.isArray(e.clubs) && e.clubs.length
            ? e.clubs.map((club) => ({ n: club.n || "", image: club.image || "" }))
            : e.kind === "career"
              ? [{ n: "", image: "" }, { n: "", image: "" }]
              : [];
        $("form").innerHTML =
          `<div class="modal"><div class="card qform" oninput="updateQuestionPreview()" onchange="updateQuestionPreview()"><div class="qf-hd"><b>${id ? "تعديل سؤال" : "سؤال جديد"}</b><button type="button" class="qf-x" aria-label="إغلاق" onclick="$('form').innerHTML=''">✕</button></div>${kindPickerHTML(e.kind || "normal")}<div class="qf-body"><div class="qf-fields"><div class="qf-label">التصنيف</div>
 <input id="ft" placeholder="اكتب تصنيفًا جديدًا أو اختر من الموجودة" autocomplete="off" value="${esc(e.t)}" oninput="syncCategoryChips()">${categoryChipsHTML(e.t)}
 <select id="fk" hidden onchange="toggleQuestionKind()"><option value="normal" ${e.kind === "normal" ? "selected" : ""}>سؤال عادي</option><option value="audio" ${e.kind === "audio" ? "selected" : ""}>سؤال صوتي</option><option value="top5" ${e.kind === "top5" ? "selected" : ""}>توب 5 — إجابات مرتبة</option><option value="top10" ${e.kind === "top10" ? "selected" : ""}>توب 10 — إجابات مرتبة</option><option value="reverse" ${e.kind === "reverse" ? "selected" : ""}>كلمات معكوسة</option><option value="visual" ${e.kind === "visual" ? "selected" : ""}>خمن صورة أو إيموجي</option><option value="career" ${e.kind === "career" ? "selected" : ""}>مسيرة لاعب — شعارات الأندية</option></select>
 <div id="questionFields"><input id="fx" placeholder="نص السؤال" value="${esc(e.x)}"></div>
 <div id="audioFields" hidden><input id="fau" type="url" dir="ltr" placeholder="رابط YouTube أو Spotify أو ملف صوتي مباشر" value="${esc(e.audioUrl || "")}" oninput="$('fauFile').value=''"><small>الصق رابط YouTube أو Spotify أو SoundCloud، أو رابطًا مباشرًا لملف صوتي. المواقع الأخرى تعمل إذا كانت توفر رابطًا مباشرًا لملف MP3 أو WAV أو OGG أو M4A أو AAC. يمكنك أيضًا رفع ملف من جهازك بحد أقصى 20 ميجابايت.</small><label for="fauFile">اختيار ملف صوتي من الجهاز</label><input id="fauFile" type="file" accept=".mp3,.wav,.ogg,.oga,.opus,.m4a,.aac"><small id="audioUploadStatus" aria-live="polite"></small></div>
 
 <div id="normalFields">
 <small>الاختيارات — اتركها فارغة لو السؤال بدون اختيارات</small>
 ${[0, 1, 2, 3].map((i) => `<input id="fo${i}" placeholder="الاختيار ${LB[i]}" value="${esc(e.o?.[i])}">`).join("")}
 <div class="qf-label">الإجابة الصحيحة</div><select id="fc" hidden>${LB.map((l, i) => `<option value="${i}" ${e.c === i ? "selected" : ""}>الصحيح: ${l}</option>`).join("")}</select>${segHTML("fc", LB.map((l, i) => [String(i), l]), String(Number.isInteger(e.c) && e.c >= 0 && e.c < 4 ? e.c : 0))}
 <input id="fa" placeholder="الإجابة النصية (لو بدون اختيارات)" value="${esc(e.a)}">
 </div> <div id="topFields" hidden><small>اكتب الإجابات بالترتيب من المركز الأول إلى ${e.kind === "top10" ? "العاشر" : "الخامس"}</small>${Array.from({ length: 10 }, (_, i) => `<input id="fr${i}" placeholder="الإجابة رقم ${i + 1}" value="${esc(e.r?.[i])}" ${i >= 5 && e.kind !== "top10" ? "hidden" : ""}>`).join("")}</div><div id="reverseFields" hidden><input id="frw" maxlength="40" dir="auto" placeholder="الكلمة الأصلية" value="${esc(e.a || "")}"></div><div id="visualFields" hidden><input id="fvp" maxlength="500" placeholder="اكتب سؤالًا يميز الصورة (مثال: من صاحب هذا الشعار؟)" value="${esc(e.x === "خمن الصورة" ? "" : e.x || "")}"><input id="fva" placeholder="الإجابة أو الكلمة المطلوب تخمينها" value="${esc(e.a || "")}"><input id="fi" type="url" dir="ltr" placeholder="رابط صورة مباشر (اختياري)" value="${esc(e.image || "")}"><input id="fe" maxlength="20" placeholder="إيموجي دالّ (اختياري)" value="${esc(e.emoji || "")}"><button id="visualBlurToggle" type="button" class="visual-blur-toggle" aria-pressed="${questionBlurEnabled}" onclick="toggleQuestionBlur()">${questionBlurEnabled ? "إزالة الضباب" : "ضيف الضباب"}</button><small>التمويه اختياري، ويُطبّق على الصورة المختارة فقط.</small><small>اكتب سؤالًا خاصًا بهذه الصورة، ثم أضف رابط صورة أو إيموجي، أو الاثنين معًا.</small></div>
 <div id="careerFields" hidden><div class="qf-label">اسم اللاعب (الإجابة)</div><input id="fca" maxlength="300" placeholder="اسم اللاعب (الإجابة)" value="${esc(e.kind === "career" ? e.a || "" : "")}"><div class="qf-label">شعارات الأندية بالترتيب من الأقدم إلى الأحدث (2–10)</div><div id="careerClubList"></div><button type="button" class="qf-add" onclick="addCareerClub()">＋ إضافة نادي</button><small>أضف رابط صورة مباشر أو صورة Base64 (PNG/JPEG/WebP/GIF، حتى 100KB لكل شعار)، واكتب اسم النادي اختياريًا. سيظهر شعار واحد في كل مرة، ويتحكم الهوست في الانتقال بينها.</small></div>
 <div class="qf-label">الصعوبة</div><select id="fd" hidden><option value="e" ${e.d === "e" ? "selected" : ""}>سهل (نقطة)</option><option value="h" ${e.d === "h" ? "selected" : ""}>صعب (نقطتان)</option></select>${segHTML("fd", [["e", "سهل · نقطة"], ["h", "صعب · نقطتان"]], e.d === "h" ? "h" : "e")}</div><aside class="qf-preview" id="qfPreview" aria-label="معاينة"></aside></div><div class="qf-ft"><button id="saveQuestionBtn" class="on big2" onclick="saveQ('${id || ""}')">💾 حفظ السؤال</button><button class="big2" onclick="$('form').innerHTML=''">إلغاء</button></div></div></div>`;
        toggleQuestionKind();
      }
      let questionClubs = [],
        questionBlurEnabled = false;
      function syncCareerClubFields() {
        questionClubs = questionClubs.map((club, i) => ({
          n: $(`careerClubName${i}`)?.value.trim() || "",
          image: $(`careerClubImage${i}`)?.value.trim() || "",
        }));
      }
      function renderCareerClubFields() {
        $("careerClubList").innerHTML = questionClubs
          .map(
            (club, i) =>
              `<div class="career-club-form-row"><span class="cb-num">${i + 1}</span><input id="careerClubName${i}" maxlength="80" placeholder="اسم النادي (اختياري)" value="${esc(club.n)}"><input id="careerClubImage${i}" type="text" maxlength="100000" dir="ltr" placeholder="رابط الصورة أو data:image/...;base64" value="${esc(club.image)}"><button type="button" class="cb-del danger" aria-label="حذف النادي ${i + 1}" title="حذف" onclick="removeCareerClub(${i})">🗑</button></div>`,
          )
          .join("");
        updateQuestionPreview();
      }
      function addCareerClub() {
        syncCareerClubFields();
        if (questionClubs.length >= 10)
          return toast("الحد الأقصى 10 أندية", 1);
        questionClubs.push({ n: "", image: "" });
        renderCareerClubFields();
      }
      function removeCareerClub(index) {
        syncCareerClubFields();
        if (questionClubs.length <= 2)
          return toast("أضف ناديين على الأقل", 1);
        questionClubs.splice(index, 1);
        renderCareerClubFields();
      }
      function toggleQuestionKind() {
        const kind = $("fk").value;
        $("questionFields").hidden = ["reverse", "visual", "audio", "career"].includes(kind);
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
        $("careerFields").hidden = kind !== "career";
        if (kind === "career") renderCareerClubFields();
        updateQuestionPreview();
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
        if (kind === "career") syncCareerClubFields();
        const clubs =
          kind === "career"
            ? questionClubs.map((club) => ({
                n: club.n.slice(0, 80),
                  image: club.image,
              }))
            : [];
        const image = kind === "visual" ? g("fi") : "",
          emoji = kind === "visual" ? g("fe") : "",
          audioFile = kind === "audio" ? $("fauFile").files[0] : null;
        let audioUrl = kind === "audio" ? g("fau") : "";
        if (kind === "audio" && !audioFile) {
          try {
            if (!/^\/audio\/[0-9a-f-]{36}$/i.test(audioUrl)) {
              const url = new URL(audioUrl);
              if (!["http:", "https:"].includes(url.protocol))
                throw new Error();
            }
            if (embeddedAudioProvider(audioUrl) === "invalid")
              throw new Error();
            if (!audioUrl) throw new Error();
          } catch {
            return toast(
              "أضف رابط YouTube أو Spotify أو SoundCloud أو رابط ملف صوتي مباشر",
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
              : kind === "career"
                ? !g("fca") ||
                  clubs.length < 2 ||
                  clubs.length > 10 ||
                  clubs.some((club) => !validClubImage(club.image))
              : kind === "audio"
                ? !audioUrl && !audioFile
                : !g("fx"))
        )
          return toast(
            kind === "visual"
              ? "اكتب نص السؤال والإجابة وأضف صورة أو إيموجي"
              : kind === "career"
                ? "اكتب اسم اللاعب وأضف شعارين على الأقل كرابط صورة أو Base64 صالح (حتى 100KB لكل شعار)"
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
            : kind === "reverse" || kind === "visual" || kind === "career"
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
                : kind === "career"
                  ? "مين اللاعب؟"
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
                  : kind === "career"
                    ? g("fca")
                  : g("fa"),
            image,
            emoji,
            audioUrl,
            clubs,
            blurEnabled:
              kind === "visual" && !!image && questionBlurEnabled,
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
      function toggleQuestionBlur() {
        if (!$("fi").value.trim())
          return toast("أضف رابط الصورة أولًا لتفعيل الضباب", 1);
        questionBlurEnabled = !questionBlurEnabled;
        const button = $("visualBlurToggle");
        button.textContent = questionBlurEnabled ? "إزالة الضباب" : "ضيف الضباب";
        button.setAttribute("aria-pressed", String(questionBlurEnabled));
        updateQuestionPreview();
      }
      function copyLink() {
        const l = location.origin + "/screen/" + ME.room;
        (navigator.clipboard
          ? navigator.clipboard.writeText(l)
          : Promise.reject()
        )
          .then(() => toast("اتنسخ الرابط"))
          .catch(() => prompt("انسخ الرابط:", l));
      }
      function copyBuzzerLink() {
        const link =
          location.origin + "/buzzer?room=" + encodeURIComponent(ME.room);
        (navigator.clipboard
          ? navigator.clipboard.writeText(link)
          : Promise.reject()
        )
          .then(() => toast("اتنسخ رابط جرس المتسابقين"))
          .catch(() => prompt("انسخ رابط جرس المتسابقين:", link));
      }
      async function logout() {
        await api("/api/logout", "POST");
        location = "/";
      }
      api("/api/me")
        .then((m) => {
          ME = m;
          connect(render, updateAudioPlaybackState);
          setInterval(advanceTimer, 200);
          setInterval(updateTimerDisplay, 200);
          setInterval(() => api("/api/ping").catch(() => {}), 240000);
        })
        .catch(() => (location = "/"));