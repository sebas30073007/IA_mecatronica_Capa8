// src/ui/toast.js
export function showToast(message) {
  let toast = document.getElementById("diagram-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "diagram-toast";
    toast.className = "diagram-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 1800);
}
