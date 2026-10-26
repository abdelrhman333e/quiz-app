      const room = location.pathname.split("/")[2];
      let reverseTimer, rouletteTimer;
      let lastQuestionAudioKey = "";
      let lastQuestionAudioControlKey = "";
      let lastScoreChangeId = null;
      let hasInitialView = false;
      let scoreNotice = null;
      let scoreNoticeTimer;
      let lastResultKey = "",
        lastBuzzKey = "",
        lastReverseLetter = "";
      let lastQuestionKey = "",
        lastOptionsKey = "",
        lastAnswerKey = "",
        lastTop5Key = "",
        lastRevealedRanks = [];
      function reverseStage(animateQuestion) {
        const letter = V.reverse?.letter,
          elapsed = Date.now() - (V.reverse?.started || 0),
          visible = !!letter && elapsed < 900;
        if (visible) reverseTimer = setTimeout(render, 905 - elapsed);
        return `<div class="tag ${animateQuestion ? "animate-in" : ""}">الكلمات المعكوسة</div>${visible ? `<div class="reverse-letter" dir="rtl">${esc(letter)}</div>` : `<div class="wait ${animateQuestion ? "animate-in" : ""}">اضغط عرض الحرف التالي من التابلت</div>`}`;
      }
      function visualStage(animateQuestion, animateAnswer) {
        if (!V.shown) return '<div class="wait">هنا هيظهر السؤال ...</div>';
        return `<div class="tag">${esc(V.t)}</div>${V.x && V.x !== "خمن الصورة" ? `<div class="card qbox ${animateQuestion ? "animate-in" : ""}">${esc(V.x)}</div>` : ""}<div class="visual-clues ${animateQuestion ? "animate-options" : ""}">${V.image ? `<img class="visual-clue" src="${esc(V.image)}" alt="قرينة بصرية">` : ""}${V.emoji ? `<div class="visual-emoji">${esc(V.emoji)}</div>` : ""}</div>${V.ans ? `<div class="ans ${animateAnswer ? "animate-in" : ""}">✔ ${esc(V.ans)}</div>` : ""}`;
      }
      function statisticsStage() {
        const correct = V.stats?.correct || 0,
          wrong = V.stats?.wrong || 0,
          deductedPoints = V.stats?.deductedPoints || 0,
          answered = correct + wrong,
          accuracy = answered ? Math.round((correct / answered) * 100) : 0;
        const contestants = V.cs.length
          ? V.cs
              .map((contestant) => {
                const playerCorrect = contestant.correct || 0,
                  playerWrong = contestant.wrong || 0,
                  playerDeductions = contestant.deductedPoints || 0,
                  playerTotal = playerCorrect + playerWrong,
                  playerAccuracy = playerTotal
                    ? Math.round((playerCorrect / playerTotal) * 100)
                    : 0;
                return `<article class="screen-stat-player"><b>${esc(contestant.n)}</b><div class="screen-stat-player-details"><span class="screen-stat-correct">صح: ${playerCorrect}</span><span class="screen-stat-wrong">خطأ: ${playerWrong}</span><span>النقاط المخصومة: ${playerDeductions}</span><span>الإجمالي: ${playerTotal}</span><span>نسبة الصح: ${playerAccuracy}%</span></div></article>`;
              })
              .join("")
          : '<div class="wait">لا يوجد متسابقون مسجلون</div>';
        return `<div class="screen-stats-overlay"><section class="screen-stats-panel"><h2>📊 إحصائيات الإجابات</h2><div class="screen-stats-summary"><div class="screen-stat screen-stat-correct"><span>إجابات صحيحة</span><b>${correct}</b></div><div class="screen-stat screen-stat-wrong"><span>إجابات خاطئة</span><b>${wrong}</b></div><div class="screen-stat"><span>إجمالي الإجابات</span><b>${answered}</b></div><div class="screen-stat"><span>نسبة الإجابات الصحيحة</span><b>${accuracy}%</b></div><div class="screen-stat screen-stat-deductions"><span>إجمالي النقاط المخصومة</span><b>${deductedPoints}</b></div></div><h3>إحصائيات كل متسابق</h3><div class="screen-stats-players">${contestants}</div></section></div>`;
      }
      function rouletteStage() {
        const roulette = V.roulette;
        if (!roulette?.frames?.length) return "";
        const elapsed = Math.max(0, Date.now() - roulette.started);
        if (elapsed >= roulette.duration) return "";
        let index = 0;
        while (
          index + 1 < roulette.frames.length &&
          roulette.frames[index + 1].at <= elapsed
        )
          index++;
        const frame = roulette.frames[index],
          nextAt = roulette.frames[index + 1]?.at ?? roulette.duration;
        rouletteTimer = setTimeout(render, Math.max(20, nextAt - elapsed));
        return `<div class="tag">${esc(frame.t)}</div><div class="card qbox roulette-question animate-in">${esc(frame.x)}</div>`;
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
        return Math.min(100, (timerRemaining(timer) / 30000) * 100);
      }
      function updateTimerDisplay() {
        const timer = V?.timer;
        const display = document.getElementById("screenTimerCountdown");
        if (display && timer) {
          const seconds = timerSeconds(timer);
          display.textContent = seconds;
          display
            .closest(".game-timer")
            .classList.toggle("timer-ending", seconds <= 5);
          const progress = document.getElementById("screenTimerProgress");
          if (progress) progress.style.width = `${timerProgress(timer)}%`;
        }
      }
      function playQuestionAudio() {
        const audio = document.getElementById("questionAudioPlayer");
        const button = document.getElementById("playQuestionAudio");
        if (audio) {
          audio.dataset.remotePaused = "false";
          audio.play().then(
            () => {
              if (button) button.hidden = true;
            },
            () => {
              if (button) button.hidden = false;
            },
          );
        }
      }
      function applyQuestionAudioControl(audio, control, questionKey) {
        if (!audio || !control) return;
        if (Number.isFinite(control.volume))
          audio.volume = Math.max(0, Math.min(1, control.volume));
        if (!control.seq) return;
        const commandKey = `${questionKey}|${control.seq}`;
        if (commandKey === lastQuestionAudioControlKey) return;
        lastQuestionAudioControlKey = commandKey;
        const run = () => {
          if (control.action === "pause") {
            audio.dataset.remotePaused = "true";
            audio.pause();
            return;
          }
          if (control.action === "restart") {
            audio.dataset.remotePaused = "false";
            if (audio.readyState >= 1) {
              audio.currentTime = 0;
              playQuestionAudio();
            } else
              audio.addEventListener(
                "loadedmetadata",
                () => {
                  audio.currentTime = 0;
                  playQuestionAudio();
                },
                { once: true },
              );
            return;
          }
          if (control.action === "play") {
            audio.dataset.remotePaused = "false";
            playQuestionAudio();
          }
        };
        run();
      }
      function render() {
        if (!V) return;
        // كل حدث SSE يعيد بناء المشهد من نسخة العرض الآمنة التي جهزها الخادم.
        // مفاتيح السؤال أدناه تميّز السؤال الجديد عن تحديث النقاط/المؤقت،
        // حتى لا تتكرر الحركة أو المؤثرات عند كل تحديث لحظي.
        clearTimeout(rouletteTimer);
        clearTimeout(reverseTimer);
        const scoreChange = V.scoreChange;
        if (!hasInitialView) {
          lastScoreChangeId = scoreChange?.id || null;
          hasInitialView = true;
        } else if (scoreChange?.id && scoreChange.id !== lastScoreChangeId) {
          lastScoreChangeId = scoreChange.id;
          scoreNotice = scoreChange;
          playSfx(scoreChange.delta > 0 ? "pointsUp" : "pointsDown");
          clearTimeout(scoreNoticeTimer);
          scoreNoticeTimer = setTimeout(() => {
            scoreNotice = null;
            render();
          }, 3500);
        }
        const b = V.buz != null ? V.cs[V.buz] : null;
        const questionContent =
            V.mode === "visual"
              ? `${V.image || ""}|${V.emoji || ""}`
              : V.mode === "audio"
                ? `${V.audioUrl || ""}|${V.x || ""}`
              : V.x || "",
          questionKey = V.shown
            ? V.mode === "reverse" && V.displayId
              ? `reverse|${V.displayId}`
              : V.mode === "quiz" || V.mode === "visual" || V.mode === "audio"
                ? `${V.mode}|${V.t}|${questionContent}|${V.displayId || ""}`
                : ""
            : "",
          animateQuestion = !!questionKey && questionKey !== lastQuestionKey;
        const optionsKey = V.o ? `${questionKey}|${V.o.join("|")}` : "",
          animateOptions = !!optionsKey && optionsKey !== lastOptionsKey,
          answerKey = V.ans ? `${questionKey}|${V.ans}` : "",
          animateAnswer = !!answerKey && answerKey !== lastAnswerKey,
          revealedRanks = lastTop5Key === questionKey ? lastRevealedRanks : [];
        const resultKey = V.res ? `${questionKey}|${V.res}` : "",
          buzzKey = V.buz == null ? "" : `${questionKey}|${V.buz}`,
          newRanks =
            V.mode === "quiz" &&
            (V.kind === "top5" || V.kind === "top10")
              ? (V.revealed || []).filter(
                  (a) => !revealedRanks.includes(a.rank),
                )
              : [],
          reverseLetter = V.mode === "reverse" ? V.reverse?.letter || "" : "";
        if (animateQuestion) playSfx("question");
        if (animateOptions) playSfx("options");
        if (V.res === "ok" && resultKey !== lastResultKey) playSfx("correct");
        else if (V.res === "no" && resultKey !== lastResultKey)
          playSfx("wrong");
        else if (animateAnswer) playSfx("answer");
        if (buzzKey && buzzKey !== lastBuzzKey) playSfx("contestant");
        newRanks.forEach(() => playSfx("rank"));
        if (reverseLetter && reverseLetter !== lastReverseLetter)
          playSfx("reverse");
        const rouletteHtml = V.shown ? rouletteStage() : "";
        const previousQuestionAudio = document.getElementById(
          "questionAudioPlayer",
        );
        const keepQuestionAudio =
          previousQuestionAudio?.dataset.questionKey === questionKey;
        const questionAudioTime = keepQuestionAudio
          ? previousQuestionAudio.currentTime
          : 0;
        const questionAudioWasPlaying =
          keepQuestionAudio && !previousQuestionAudio.paused;
        const roundBanner = V.round
          ? `<div class="round-screen-banner"><b>🏁 ${esc(V.round.name)}</b><span>الهدف: ${V.round.target} نقطة</span>${V.round.winner ? `<strong>🏆 الفائز: ${esc(V.round.winner)} · ${V.round.finished ? "انتهت الجولة" : "الجولة مستمرة"}</strong>` : ""}${V.round.finished && !V.round.winner ? "<span>انتهت الجولة</span>" : ""}</div>`
          : "";
        document.getElementById("app").innerHTML =
          `<button id="screenSfxToggle" class="screen-sfx-toggle ${sfxEnabled ? "on" : ""}" aria-pressed="${sfxEnabled}" onclick="toggleSfx()">${sfxEnabled ? "🔊 كتم المؤثرات" : "🔇 تفعيل المؤثرات"}</button><div class="scr">${roundBanner}<div class="stage">
${
  V.showStats
    ? statisticsStage()
    : rouletteHtml
      ? rouletteHtml
      : V.mode === "reverse"
        ? reverseStage(animateQuestion)
        : V.mode === "visual"
          ? visualStage(animateQuestion, animateAnswer)
          : V.shown
            ? `<div class="tag">${esc(V.t)} · ${V.kind === "top5" || V.kind === "top10" ? "النقاط حسب الترتيب" : V.d === "h" ? "صعب — نقطتان" : "سهل — نقطة"}</div><div class="card qbox ${animateQuestion ? "animate-in" : ""}">${esc(V.x)}</div>
 ${V.mode === "audio" ? `<button id="playQuestionAudio" class="on" onclick="playQuestionAudio()" hidden>▶ تشغيل الصوت</button><audio id="questionAudioPlayer" class="question-audio-player" controls preload="metadata" data-question-key="${esc(questionKey)}" onerror="this.nextElementSibling.hidden=false"><source src="${esc(V.audioUrl)}"></audio><small hidden>تعذر تحميل الرابط الصوتي، تأكد من أنه رابط مباشر لملف صوتي.</small>` : ""}
 ${V.kind === "top5" || V.kind === "top10" ? V.revealed?.length ? `<div class="opts">${V.revealed.map((a) => `<div class="opt ok ${revealedRanks.includes(a.rank) ? "" : "animate-in"}"><b>${a.rank}</b>${esc(a.a)}</div>`).join("")}</div>` : "" : ""}
 ${V.o ? `<div class="opts ${animateOptions ? "animate-options" : ""}">${V.o.map((o, i) => `<div class="opt ${V.c === i ? "ok" : ""}"><b>${LB[i]}</b>${esc(o)}</div>`).join("")}</div>` : ""}
 ${V.ans ? `<div class="ans ${animateAnswer ? "animate-in" : ""}">✔ ${esc(V.ans)}</div>` : ""}`
            : '<div class="wait">هنا هيظهر السؤال ...</div>'
}
 ${!V.showStats && V.timer && V.timer.phase !== "done" ? `<div class="game-timer ${timerSeconds(V.timer) <= 5 ? "timer-ending" : ""}"><div class="timer-readout"><span>${V.timer.phase === "question" ? "السؤال" : "الاختيارات"}${V.timer.paused ? " · متوقف" : ""}</span><b id="screenTimerCountdown">${timerSeconds(V.timer)}</b><small>ثانية</small></div><div class="timer-track"><i id="screenTimerProgress" style="width:${timerProgress(V.timer)}%"></i></div></div>` : ""}
 ${!V.showStats && V.mode !== "reverse" && b ? `<div class="buz">🔔 ${esc(b.n)} · ${b.s} نقطة ${V.res === "ok" ? "✅" : V.res === "no" ? "❌" : ""}</div>` : ""}</div>
 <div class="card" style="align-self:start"><h3>🏆 ${V.round ? `ترتيب ${esc(V.round.name)}` : "الترتيب"}</h3><div class="board">${board(V.round ? V.cs.filter((contestant) => contestant.roundParticipant) : V.cs)}</div></div></div>`;
        if (scoreNotice) {
          const amount = Math.abs(scoreNotice.delta),
            pointLabel = amount === 1 ? "نقطة" : "نقاط",
            sign = scoreNotice.delta > 0 ? "+" : "−",
            direction =
              scoreNotice.delta > 0 ? "score-notice-up" : "score-notice-down";
          document.getElementById("app").insertAdjacentHTML(
            "beforeend",
            `<div class="score-notice ${direction}" role="status" aria-live="polite"><b>${esc(scoreNotice.contestant)}</b><span>${sign}${amount} ${pointLabel}</span><small>الإجمالي: ${scoreNotice.score}</small></div>`,
          );
        }
        if (!V.showStats && V.mode === "audio" && V.shown) {
          const audio = document.getElementById("questionAudioPlayer"),
            button = document.getElementById("playQuestionAudio"),
            shouldPlay = keepQuestionAudio
              ? questionAudioWasPlaying
              : questionKey !== lastQuestionAudioKey;
          const restoreAndPlay = () => {
            if (
              keepQuestionAudio &&
              Number.isFinite(questionAudioTime) &&
              questionAudioTime < audio.duration
            )
              audio.currentTime = questionAudioTime;
            if (shouldPlay && audio.dataset.remotePaused !== "true")
              audio.play().catch(() => {
                if (button) button.hidden = false;
              });
          };
          if (audio.readyState >= 1) restoreAndPlay();
          else
            audio.addEventListener("loadedmetadata", restoreAndPlay, {
              once: true,
            });
          audio.addEventListener("play", () => {
            if (button) button.hidden = true;
          });
          audio.addEventListener("pause", () => {
            if (button) button.hidden = false;
          });
          if (button) button.hidden = !audio.paused && !audio.ended;
          applyQuestionAudioControl(audio, V.audioControl, questionKey);
          lastQuestionAudioKey = questionKey;
        } else {
          lastQuestionAudioKey = "";
          lastQuestionAudioControlKey = "";
        }
        lastQuestionKey = questionKey;
        lastOptionsKey = optionsKey;
        lastAnswerKey = answerKey;
        lastTop5Key = questionKey;
        lastRevealedRanks =
          V.mode === "quiz" &&
          (V.kind === "top5" || V.kind === "top10")
            ? (V.revealed || []).map((a) => a.rank)
            : [];
        lastResultKey = resultKey;
        lastBuzzKey = buzzKey;
        lastReverseLetter = reverseLetter;
      }
      setInterval(updateTimerDisplay, 200);
      if (room) connectView(room, render);
      else
        document.getElementById("app").innerHTML =
          '<div class="home"><h1>افتح رابط الشاشة من التابلت</h1></div>';
