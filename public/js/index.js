      let M = "login";
      const $ = (i) => document.getElementById(i);
      function mode(m) {
        M = m;
        $("b1").className = m === "login" ? "on" : "";
        $("b2").className = m === "register" ? "on" : "";
        $("go").textContent = m === "login" ? "دخول" : "إنشاء حساب";
      }
      async function go() {
        $("msg").textContent = "";
        try {
          const r = await fetch("/api/" + M, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ u: $("u").value, p: $("p").value }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          location = "/tablet";
        } catch (e) {
          $("msg").textContent = e.message;
        }
      }
      fetch("/api/me").then((r) => {
        if (r.ok) location = "/tablet";
      });
