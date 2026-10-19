"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "nosso-dinheiro-theme";
const changeEvent = "nosso-dinheiro-theme-change";

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    document.documentElement.dataset.theme =
      event.newValue === "light" ? "light" : "dark";
    updateBrowserColor();
    onChange();
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function updateBrowserColor() {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      document.documentElement.dataset.theme === "light"
        ? "#f7f6f2"
        : "#101117",
    );
}

export function ThemePicker() {
  const theme = useSyncExternalStore(
    subscribe,
    () =>
      document.documentElement.dataset.theme === "light" ? "light" : "dark",
    () => "dark",
  );

  function selectTheme(value: "light" | "dark") {
    document.documentElement.dataset.theme = value;
    updateBrowserColor();
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // The theme still works when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(changeEvent));
  }

  return (
    <section className="settings-section">
      <h3>Aparência</h3>
      <p>Escolha como você prefere ver o aplicativo neste dispositivo.</p>
      <div
        className="segmented theme-picker"
        role="group"
        aria-label="Tema do aplicativo"
      >
        <button
          type="button"
          className={theme === "light" ? "active" : ""}
          aria-pressed={theme === "light"}
          onClick={() => selectTheme("light")}
        >
          <Sun size={17} /> Modo claro
        </button>
        <button
          type="button"
          className={theme === "dark" ? "active" : ""}
          aria-pressed={theme === "dark"}
          onClick={() => selectTheme("dark")}
        >
          <Moon size={17} /> Modo escuro
        </button>
      </div>
    </section>
  );
}
