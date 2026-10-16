(() => {
  const split = document.querySelector(".split"),
    drawers = {
      vis: { el: document.querySelector(".split .vis"), btn: byId("dockVis") },
      src: { el: document.querySelector(".split > .left"), btn: byId("dockSrc") },
    };
  const KEY = "rtuiDock";
  let open = { vis: true, src: false };
  try {
    Object.assign(open, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {}

  const GAP = 12; 
  function sync() {
    const l = open.vis ? drawers.vis.el.offsetWidth + GAP * 2 : GAP,
      b = open.src ? drawers.src.el.offsetHeight + GAP * 2 : GAP;
    split.style.setProperty("--dock-l", l + "px");
    split.style.setProperty("--dock-b", b + "px");
  }
  function apply() {
    for (const k in drawers) {
      drawers[k].el.classList.toggle("closed", !open[k]);
      drawers[k].btn.classList.toggle("on", !!open[k]);
      drawers[k].btn.setAttribute("aria-pressed", !!open[k]);
    }
    sync();
    try {
      localStorage.setItem(KEY, JSON.stringify(open));
    } catch (e) {}
  }
  const toggle = (k, v = !open[k]) => {
    open[k] = v;
    apply();
  };

  for (const k in drawers) {
    drawers[k].btn.onclick = () => toggle(k);
    new ResizeObserver(sync).observe(drawers[k].el);
  }
  document.querySelectorAll("[data-dock-close]").forEach((b) => {
    b.onclick = () => toggle(b.dataset.dockClose, false);
  });
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === "Digit1") (e.preventDefault(), toggle("vis"));
    if (e.code === "Digit2") (e.preventDefault(), toggle("src"));
  });
  apply();
})();
