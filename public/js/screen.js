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
      let spotifyIframeAPI = null,
        spotifyEmbedController = null,
        spotifyEmbedKey = "",
        spotifyControllerReady = false,
        pendingSpotifyCommand = null,
        youtubePlayer = null,
        youtubeEmbedKey = "",
        youtubePlayerReady = false,
        pendingYoutubeCommand = null,
        youtubeTelemetryTimer = null,
        lastAudioTelemetryAt = 0,
        pendingAudioTelemetry = null,
        audioTelemetryTimer = null;
      function publishAudioTelemetry(state) {
        if (!room || !V?.shown || V.mode !== "audio" || !V.displayId) return;
        const now = Date.now(),
          telemetry = { ...state, displayId: V.displayId },
          delay = 700 - (now - lastAudioTelemetryAt);
        if (delay > 0) {
          pendingAudioTelemetry = telemetry;
          if (!audioTelemetryTimer)
            audioTelemetryTimer = setTimeout(() => {
              audioTelemetryTimer = null;
              const latest = pendingAudioTelemetry;
              pendingAudioTelemetry = null;
              if (latest) publishAudioTelemetry(latest);
            }, delay);
          return;
        }
        lastAudioTelemetryAt = now;
        fetch(`/audio-state?room=${encodeURIComponent(room)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(telemetry),
        }).then((response) => {
          if (!response.ok && response.status !== 409)
            throw new Error(`تعذر مزامنة موضع الصوت (${response.status})`);
        }).catch((error) => {
          console.error(error.message || "تعذر مزامنة موضع الصوت", error);
        });
      }
      function audioEmbedSource(audioUrl) {
        try {
          const url = new URL(audioUrl),
            host = url.hostname.toLowerCase();
          if (
            [
              "youtube.com",
              "www.youtube.com",
              "m.youtube.com",
              "music.youtube.com",
              "youtu.be",
              "youtube-nocookie.com",
              "www.youtube-nocookie.com",
            ].includes(host)
          ) {
            const videoId =
              host === "youtu.be"
                ? url.pathname.split("/")[1]
                : url.searchParams.get("v") ||
                  url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
            if (!/^[\w-]{11}$/.test(videoId || "")) return null;
            const embedUrl = new URL(
              `https://www.youtube-nocookie.com/embed/${videoId}`,
            );
            embedUrl.searchParams.set("autoplay", "1");
            embedUrl.searchParams.set("enablejsapi", "1");
            embedUrl.searchParams.set("origin", location.origin);
            embedUrl.searchParams.set("playsinline", "1");
            return { provider: "youtube", src: embedUrl.href };
          }
          if (host === "open.spotify.com") {
            const match = url.pathname.match(
              /\/(?:track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/,
            );
            if (!match) return null;
            const embedUrl = new URL(
              `https://open.spotify.com/embed${url.pathname.slice(url.pathname.indexOf(match[0]))}`,
            );
            const spotifyUrl = new URL(
              `${url.pathname.slice(url.pathname.indexOf(match[0]))}${url.search}`,
              url.origin,
            );
            return {
              provider: "spotify",
              src: embedUrl.href,
              url: spotifyUrl.href,
            };
          }
          if (host === "soundcloud.com" || host === "www.soundcloud.com") {
            const embedUrl = new URL("https://w.soundcloud.com/player/");
            embedUrl.searchParams.set("url", url.href);
            embedUrl.searchParams.set("auto_play", "true");
            embedUrl.searchParams.set("hide_related", "true");
            embedUrl.searchParams.set("visual", "false");
            return { provider: "soundcloud", src: embedUrl.href };
          }
        } catch {}
        return null;
      }
      function publishYoutubeTelemetry() {
        if (!youtubePlayerReady || !youtubePlayer || !V?.displayId) return;
        const duration = youtubePlayer.getDuration(),
          position = youtubePlayer.getCurrentTime(),
          state = youtubePlayer.getPlayerState();
        if (!Number.isFinite(duration) || duration <= 0) return;
        publishAudioTelemetry({
          position,
          duration,
          paused: state !== window.YT.PlayerState.PLAYING,
          provider: "youtube",
        });
      }
      function sendYoutubeAudioCommand(action, value) {
        if (!youtubePlayerReady || !youtubePlayer) {
          pendingYoutubeCommand = { action, value };
          return;
        }
        const commands = {
          pause: () => youtubePlayer.pauseVideo(),
          play: () => youtubePlayer.playVideo(),
          restart: () => {
            youtubePlayer.seekTo(0, true);
            youtubePlayer.playVideo();
          },
          seek: () => youtubePlayer.seekTo(value, true),
          volume: () => youtubePlayer.setVolume(Math.round(value * 100)),
        };
        if (commands[action]) commands[action]();
        publishYoutubeTelemetry();
      }
      function destroyYoutubePlayer() {
        clearInterval(youtubeTelemetryTimer);
        youtubeTelemetryTimer = null;
        if (youtubePlayer) youtubePlayer.destroy();
        youtubePlayer = null;
        youtubeEmbedKey = "";
        youtubePlayerReady = false;
        pendingYoutubeCommand = null;
      }
      function createYoutubePlayer() {
        const frame = document.getElementById("questionAudioEmbed");
        if (
          !window.YT?.Player ||
          !frame ||
          frame.dataset.provider !== "youtube"
        )
          return;
        const questionKey = frame.dataset.questionKey;
        if (youtubePlayer && youtubeEmbedKey === questionKey) return;
        destroyYoutubePlayer();
        youtubeEmbedKey = questionKey;
        try {
          youtubePlayer = new window.YT.Player(frame, {
            events: {
              onReady: () => {
                if (
                  document.getElementById("questionAudioEmbed") !== frame ||
                  frame.dataset.questionKey !== youtubeEmbedKey
                ) {
                  destroyYoutubePlayer();
                  return;
                }
                youtubePlayerReady = true;
                if (pendingYoutubeCommand) {
                  const command = pendingYoutubeCommand;
                  pendingYoutubeCommand = null;
                  sendYoutubeAudioCommand(command.action, command.value);
                }
                publishYoutubeTelemetry();
                youtubeTelemetryTimer = setInterval(
                  publishYoutubeTelemetry,
                  800,
                );
              },
              onStateChange: publishYoutubeTelemetry,
              onError: (event) => {
                console.error(
                  `تعذر تشغيل فيديو YouTube (رمز ${event.data})`,
                );
              },
            },
          });
        } catch (error) {
          console.error("تعذر تهيئة مشغّل YouTube:", error);
        }
      }
      function loadYoutubeIframeAPI() {
        if (window.YT?.Player) {
          createYoutubePlayer();
          return;
        }
        if (document.getElementById("youtubeIframeApi")) return;
        window.onYouTubeIframeAPIReady = createYoutubePlayer;
        const script = document.createElement("script");
        script.id = "youtubeIframeApi";
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => {
          console.error("تعذر تحميل YouTube iFrame API");
        };
        document.head.appendChild(script);
      }
      function applyEmbeddedAudioControl(embed, control, questionKey) {
        if (!embed || !control?.seq) return;
        const commandKey = `${questionKey}|${control.seq}`;
        if (commandKey === lastQuestionAudioControlKey) return;
        lastQuestionAudioControlKey = commandKey;
        if (embed.provider === "spotify") {
          if (control.action !== "volume")
            sendSpotifyAudioCommand(control.action, control.position);
          return;
        }
        if (embed.provider !== "youtube") return;
        sendYoutubeAudioCommand(
          control.action,
          control.action === "volume" ? control.volume : control.position,
        );
      }
      function sendSpotifyAudioCommand(action, value) {
        if (!spotifyEmbedController || !spotifyControllerReady) {
          pendingSpotifyCommand = { action, value };
          return;
        }
        const commands = {
          pause: () => spotifyEmbedController.pause(),
          play: () => spotifyEmbedController.resume(),
          restart: () => spotifyEmbedController.restart(),
          seek: () => spotifyEmbedController.seek(Math.floor(value)),
        };
        if (commands[action]) commands[action]();
      }
      function createSpotifyEmbed() {
        const host = document.getElementById("questionAudioEmbed"),
          element = document.getElementById("spotifyAudioFrame");
        if (
          !spotifyIframeAPI ||
          !host ||
          !element ||
          host.dataset.provider !== "spotify"
        )
          return;
        const questionKey = host.dataset.questionKey;
        if (spotifyEmbedController && spotifyEmbedKey === questionKey) return;
        if (spotifyEmbedController) spotifyEmbedController.destroy();
        spotifyEmbedController = null;
        spotifyControllerReady = false;
        spotifyEmbedKey = questionKey;
        pendingSpotifyCommand = null;
        try {
          spotifyIframeAPI.createController(
            element,
            {
              url: host.dataset.spotifyUrl,
              width: "100%",
              height: 152,
            },
            (controller) => {
              if (
                document.getElementById("questionAudioEmbed") !== host ||
                host.dataset.questionKey !== spotifyEmbedKey
              ) {
                controller.destroy();
                return;
              }
              spotifyEmbedController = controller;
              controller.addListener("ready", () => {
                spotifyControllerReady = true;
                controller.addListener("playback_update", (event) => {
                  const position = Number(event.data?.position) / 1000,
                    duration = Number(event.data?.duration) / 1000;
                  if (
                    !Number.isFinite(position) ||
                    !Number.isFinite(duration) ||
                    duration <= 0
                  )
                    return;
                  publishAudioTelemetry({
                    position,
                    duration,
                    paused: !!event.data.isPaused,
                    provider: "spotify",
                  });
                });
                if (!pendingSpotifyCommand) return;
                const command = pendingSpotifyCommand;
                pendingSpotifyCommand = null;
                sendSpotifyAudioCommand(command.action, command.value);
              });
            },
          );
        } catch (error) {
          console.error("تعذر تهيئة مشغّل Spotify:", error);
          host.textContent = "تعذر تهيئة مشغّل Spotify. أعد تحميل الصفحة.";
        }
      }
      function loadSpotifyIframeAPI() {
        if (spotifyIframeAPI) {
          createSpotifyEmbed();
          return;
        }
        if (document.getElementById("spotifyIframeApi")) return;
        window.onSpotifyIframeApiReady = (api) => {
          spotifyIframeAPI = api;
          createSpotifyEmbed();
        };
        const script = document.createElement("script");
        script.id = "spotifyIframeApi";
        script.src = "https://open.spotify.com/embed/iframe-api/v1";
        script.async = true;
        script.onerror = () => {
          const element = document.getElementById("questionAudioEmbed");
          console.error("تعذر تحميل Spotify iFrame API");
          if (element)
            element.textContent =
              "تعذر تحميل مشغّل Spotify. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.";
        };
        document.head.appendChild(script);
      }
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
          if (
            control.action === "seek" &&
            Number.isFinite(control.position) &&
            Number.isFinite(audio.duration)
          ) {
            audio.currentTime = Math.min(
              Math.max(0, control.position),
              audio.duration,
            );
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
        const b = V.buz != null ? V.cs[V.buz] : null,
          audioEmbed = V.mode === "audio" ? audioEmbedSource(V.audioUrl) : null;
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
        const previousQuestionEmbed = document.getElementById(
          "questionAudioEmbed",
        );
        const keepQuestionAudio =
          previousQuestionAudio?.dataset.questionKey === questionKey;
        const keepQuestionEmbed =
          !!audioEmbed &&
          !V.showStats &&
          !rouletteHtml &&
          previousQuestionEmbed?.dataset.questionKey === questionKey;
        const questionAudioTime = keepQuestionAudio
          ? previousQuestionAudio.currentTime
          : 0;
        const questionAudioWasPlaying =
          keepQuestionAudio && !previousQuestionAudio.paused;
        const roundBanner = V.round
          ? `<div class="round-screen-banner"><b>🏁 ${esc(V.round.name)}</b><span>الهدف: ${V.round.target} نقطة</span>${V.round.winner ? `<strong>🏆 الفائز: ${esc(V.round.winner)} · ${V.round.finished ? "انتهت الجولة" : "الجولة مستمرة"}</strong>` : ""}${V.round.finished && !V.round.winner ? "<span>انتهت الجولة</span>" : ""}</div>`
          : "";
        document.getElementById("app").innerHTML =
          `<button id="screenSfxToggle" class="screen-sfx-toggle ${sfxEnabled ? "on" : ""}" aria-pressed="${sfxEnabled}" onclick="toggleSfx()">${sfxEnabled ? "🔊 كتم المؤثرات" : "🔇 تفعيل المؤثرات"}</button><div class="scr ${V.round ? "round-screen" : ""}">${roundBanner}<div class="stage ${V.round ? "has-round" : ""}">
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
 ${V.mode === "audio"   ? audioEmbed ? audioEmbed.provider === "spotify" ? `<div id="questionAudioEmbed" class="question-audio-embed spotify" data-provider="spotify" data-question-key="${esc(questionKey)}" data-spotify-url="${esc(audioEmbed.url)}"><div id="spotifyAudioFrame"></div></div><small>يمكن التحكم في التشغيل والإيقاف والإعادة من التابلت.</small>` : `<iframe id="questionAudioEmbed" class="question-audio-embed ${audioEmbed.provider}" data-provider="${audioEmbed.provider}" data-question-key="${esc(questionKey)}" src="${esc(audioEmbed.src)}" title="مشغل الصوت" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><small>استخدم أزرار المشغّل للتحكم في الصوت${audioEmbed.provider === "youtube" ? "، أو أزرار التابلت" : ""}.</small>` : `<button id="playQuestionAudio" class="on" onclick="playQuestionAudio()" hidden>▶ تشغيل الصوت</button><audio id="questionAudioPlayer" class="question-audio-player" controls preload="metadata" data-question-key="${esc(questionKey)}" onerror="this.nextElementSibling.hidden=false"><source src="${esc(V.audioUrl)}"></audio><small hidden>تعذر تحميل الرابط الصوتي؛ تأكد من أن الرابط مباشر لملف صوتي.</small>` : ""}
 ${V.kind === "top5" || V.kind === "top10" ? V.revealed?.length ? `<div class="opts">${V.revealed.map((a) => `<div class="opt ok ${revealedRanks.includes(a.rank) ? "" : "animate-in"}"><b>${a.rank}</b>${esc(a.a)}</div>`).join("")}</div>` : "" : ""}
 ${V.o ? `<div class="opts ${animateOptions ? "animate-options" : ""}">${V.o.map((o, i) => `<div class="opt ${V.c === i ? "ok" : ""}"><b>${LB[i]}</b>${esc(o)}</div>`).join("")}</div>` : ""}
 ${V.ans ? `<div class="ans ${animateAnswer ? "animate-in" : ""}">✔ ${esc(V.ans)}</div>` : ""}`
            : '<div class="wait">هنا هيظهر السؤال ...</div>'
}
 ${!V.showStats && V.timer && V.timer.phase !== "done" ? `<div class="game-timer ${timerSeconds(V.timer) <= 5 ? "timer-ending" : ""}"><div class="timer-readout"><span>${V.timer.phase === "question" ? "السؤال" : "الاختيارات"}${V.timer.paused ? " · متوقف" : ""}</span><b id="screenTimerCountdown">${timerSeconds(V.timer)}</b><small>ثانية</small></div><div class="timer-track"><i id="screenTimerProgress" style="width:${timerProgress(V.timer)}%"></i></div></div>` : ""}
 ${!V.showStats && V.mode !== "reverse" && b ? `<div class="buz">🔔 ${esc(b.n)} · ${b.s} نقطة ${V.res === "ok" ? "✅" : V.res === "no" ? "❌" : ""}</div>` : ""}</div>
 <div class="card screen-board"><h3>🏆 ${V.round ? `ترتيب ${esc(V.round.name)}` : "الترتيب"}</h3><div class="board">${board(V.round ? V.cs.filter((contestant) => contestant.roundParticipant) : V.cs)}</div></div></div>`;
        if (keepQuestionEmbed)
          document
            .getElementById("questionAudioEmbed")
            ?.replaceWith(previousQuestionEmbed);
        const questionAudioFrame = document.getElementById(
          "questionAudioEmbed",
        );
        if (
          audioEmbed?.provider === "youtube" &&
          questionAudioFrame &&
          questionAudioFrame.dataset.youtubeLoadHandler !== "true"
        ) {
          questionAudioFrame.dataset.youtubeLoadHandler = "true";
          questionAudioFrame.addEventListener(
            "load",
            () => {
              questionAudioFrame.dataset.youtubeReady = "true";
              const pending = questionAudioFrame.dataset.pendingYoutubeCommand;
              if (!pending) return;
              delete questionAudioFrame.dataset.pendingYoutubeCommand;
              const command = JSON.parse(pending);
              sendYoutubeAudioCommand(command.action, command.value);
            },
            { once: true },
          );
        }
        if (audioEmbed?.provider === "spotify") loadSpotifyIframeAPI();
        else {
          if (spotifyEmbedController) spotifyEmbedController.destroy();
          spotifyEmbedController = null;
          spotifyControllerReady = false;
          spotifyEmbedKey = "";
          pendingSpotifyCommand = null;
        }
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
          if (audioEmbed) {
            applyEmbeddedAudioControl(
              audioEmbed,
              V.audioControl,
              questionKey,
            );
          } else {
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
            const publishAudioPosition = () => {
              if (!Number.isFinite(audio.duration) || audio.duration <= 0)
                return;
              publishAudioTelemetry({
                position: audio.currentTime,
                duration: audio.duration,
                paused: audio.paused,
                provider: "audio",
              });
            };
            audio.addEventListener("timeupdate", publishAudioPosition);
            audio.addEventListener("loadedmetadata", publishAudioPosition);
            audio.addEventListener("play", publishAudioPosition);
            audio.addEventListener("pause", publishAudioPosition);
            if (button) button.hidden = !audio.paused && !audio.ended;
            applyQuestionAudioControl(audio, V.audioControl, questionKey);
          }
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
