"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  Download,
  RefreshCw,
  Share,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import {
  APP_VERSION,
  PRODUCTION_URL,
  canApplyUpdate,
  mobilePlatform,
  versionFromResponse,
  type MobilePlatform,
} from "@/lib/pwa";

type InstallEvent = Event & {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type RuntimeContext = {
  installed: boolean;
  openInstall(): void;
  setBlocker(id: string, blocked: boolean): void;
};
const Runtime = createContext<RuntimeContext | null>(null);
const DISMISS_KEY = "nosso-dinheiro-install-dismissed";

export function useUpdateGuard(blocked: boolean) {
  const runtime = useContext(Runtime);
  const setBlocker = runtime?.setBlocker;
  const id = useId();
  useEffect(() => {
    setBlocker?.(id, blocked);
    return () => setBlocker?.(id, false);
  }, [blocked, id, setBlocker]);
}

export function InstallButton() {
  const runtime = useContext(Runtime);
  if (!runtime) return null;
  return (
    <button
      type="button"
      className="button secondary full"
      onClick={runtime.openInstall}
    >
      {runtime.installed ? <Check size={16} /> : <Download size={16} />}
      {runtime.installed
        ? "App instalado neste celular"
        : "Instalar no celular"}
    </button>
  );
}

export function AppRuntime({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<MobilePlatform>("other");
  const [installed, setInstalled] = useState(false);
  const [canonical, setCanonical] = useState(false);
  const [visible, setVisible] = useState(true);
  const [online, setOnline] = useState(true);
  const [offer, setOffer] = useState(false);
  const [guide, setGuide] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState("");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Set<string>>(() => new Set());
  const promptRef = useRef<InstallEvent | null>(null);
  const guideRef = useRef<HTMLDialogElement>(null);
  const reloading = useRef(false);

  const setBlocker = useCallback((id: string, blocked: boolean) => {
    setBlockers((previous) => {
      if (previous.has(id) === blocked) return previous;
      const next = new Set(previous);
      if (blocked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const openInstall = useCallback(() => {
    setInstallError("");
    setGuide(true);
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const syncDisplayMode = () => {
      const alreadyInstalled =
        standalone.matches ||
        Boolean((navigator as NavigatorWithStandalone).standalone);
      setInstalled(alreadyInstalled);
      if (alreadyInstalled) {
        setOffer(false);
        setGuide(false);
      }
    };
    const prepare = () => {
      setCanonical(
        window.location.hostname.endsWith(".vercel.app") &&
          window.location.origin !== PRODUCTION_URL,
      );
      const detected = mobilePlatform(
        navigator.userAgent,
        navigator.maxTouchPoints,
      );
      setPlatform(detected);
      syncDisplayMode();
      let dismissed = false;
      try {
        dismissed = sessionStorage.getItem(DISMISS_KEY) === "yes";
      } catch {
        /* Private browsers may disable storage. */
      }
      if (
        detected !== "other" &&
        !standalone.matches &&
        !(navigator as NavigatorWithStandalone).standalone &&
        !dismissed
      )
        setOffer(true);
    };
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallEvent;
      setCanPrompt(true);
    };
    const didInstall = () => {
      promptRef.current = null;
      setCanPrompt(false);
      setInstalled(true);
      setOffer(false);
      setGuide(false);
    };
    // Register listeners immediately; determine the device after hydration.
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    standalone.addEventListener("change", syncDisplayMode);
    const frame = requestAnimationFrame(prepare);
    let registration: ServiceWorkerRegistration | undefined;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((value) => {
          registration = value;
        })
        .catch(() => {
          /* Installation guidance works even when workers are unavailable. */
        });
    }
    const updateWorker = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", updateWorker);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      standalone.removeEventListener("change", syncDisplayMode);
      document.removeEventListener("visibilitychange", updateWorker);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let checking = false;
    const controller = new AbortController();
    async function checkVersion() {
      setVisible(document.visibilityState === "visible");
      setOnline(navigator.onLine);
      if (
        checking ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      checking = true;
      try {
        const response = await fetch("/api/version", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (
          response.ok &&
          response.headers.get("content-type")?.includes("application/json")
        ) {
          const version = versionFromResponse(await response.json());
          if (!stopped && version)
            setAvailableVersion(version === APP_VERSION ? null : version);
        }
      } catch {
        /* Offline or failed checks never interrupt editing or trigger a reload. */
      } finally {
        checking = false;
      }
    }
    const interval = setInterval(() => void checkVersion(), 60_000);
    document.addEventListener("visibilitychange", checkVersion);
    window.addEventListener("focus", checkVersion);
    window.addEventListener("online", checkVersion);
    void checkVersion();
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkVersion);
      window.removeEventListener("focus", checkVersion);
      window.removeEventListener("online", checkVersion);
    };
  }, []);

  useEffect(() => {
    if (
      !reloading.current &&
      canApplyUpdate(
        APP_VERSION,
        availableVersion,
        blockers.size > 0 || guide || installing,
        visible,
        online,
      )
    ) {
      reloading.current = true;
      window.location.reload();
    }
  }, [availableVersion, blockers, guide, installing, visible, online]);

  useEffect(() => {
    const dialog = guideRef.current;
    if (guide && dialog && !dialog.open) dialog.showModal();
    if (!guide && dialog?.open) dialog.close();
  }, [guide]);

  function dismissOffer() {
    setOffer(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "yes");
    } catch {
      /* Dismissing still works without storage. */
    }
  }

  async function install() {
    const prompt = promptRef.current;
    if (!prompt || canonical) {
      openInstall();
      return;
    }
    setInstalling(true);
    setInstallError("");
    try {
      // Native installation is allowed only from this user-initiated button.
      const choice = await prompt.prompt();
      if (choice.outcome === "accepted") {
        setOffer(false);
        setGuide(false);
      }
    } catch {
      setInstallError(
        "O navegador não abriu a instalação. Use as instruções abaixo.",
      );
      setGuide(true);
    } finally {
      promptRef.current = null;
      setCanPrompt(false);
      setInstalling(false);
    }
  }

  const context = useMemo(
    () => ({ installed, openInstall, setBlocker }),
    [installed, openInstall, setBlocker],
  );
  return (
    <Runtime.Provider value={context}>
      {offer && !installed && (
        <aside className="install-invite" aria-label="Instalar Nosso Dinheiro">
          <span className="install-icon">
            <Smartphone size={23} />
          </span>
          <div>
            <strong>Nosso Dinheiro no seu celular</strong>
            <p>Um ícone na tela inicial. Seus planos sempre por perto.</p>
          </div>
          <button
            type="button"
            className="button primary"
            onClick={canPrompt && !canonical ? install : openInstall}
            disabled={installing}
          >
            {canPrompt && !canonical ? "Instalar" : "Como instalar"}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Lembrar da instalação depois"
            onClick={dismissOffer}
          >
            <X size={17} />
          </button>
        </aside>
      )}
      {availableVersion && (
        <div className="app-update-status" role="status">
          <RefreshCw size={15} />
          <span>
            Uma atualização está pronta. Ela será aplicada quando você terminar
            de editar ou salvar.
          </span>
        </div>
      )}
      {children}
      <dialog
        ref={guideRef}
        className="modal install-modal"
        aria-labelledby="install-title"
        onCancel={(event) => {
          event.preventDefault();
          setGuide(false);
        }}
      >
        <div className="modal-title">
          <h2 id="install-title">Leve seus planos com você</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar instruções de instalação"
            onClick={() => setGuide(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="install-app-name">
          <span className="brand-icon">
            <Wallet size={24} />
          </span>
          <div>
            <strong>Nosso Dinheiro</strong>
            <p>Finanças a dois, na tela inicial.</p>
          </div>
        </div>
        {installed ? (
          <p className="form-success">
            <Check size={16} /> Você já está usando o app instalado.
          </p>
        ) : canonical ? (
          <>
            <p>
              Para receber as próximas versões, instale pelo endereço permanente
              do app.
            </p>
            <a className="button primary full" href={PRODUCTION_URL}>
              Abrir endereço de instalação <Download size={16} />
            </a>
          </>
        ) : (
          <>
            {canPrompt && (
              <button
                type="button"
                className="button primary full"
                onClick={install}
                disabled={installing}
              >
                <Download size={17} />
                {installing ? "Abrindo instalação…" : "Instalar Nosso Dinheiro"}
              </button>
            )}
            <ol className="install-steps">
              {platform === "ios" ? (
                <>
                  <li>
                    Abra este endereço no <strong>Safari</strong> do iPhone ou
                    iPad.
                  </li>
                  <li>
                    Toque em <strong>Compartilhar</strong> <Share size={14} />.
                    Se necessário, abra o menu da página primeiro.
                  </li>
                  <li>
                    Escolha <strong>Adicionar à Tela de Início</strong>,
                    mantenha <strong>Abrir como App Web</strong> ativado se
                    aparecer, e confirme em <strong>Adicionar</strong>.
                  </li>
                </>
              ) : platform === "android" ? (
                <>
                  <li>
                    Abra este endereço no <strong>Chrome</strong> do Android.
                  </li>
                  <li>
                    {canPrompt
                      ? "Use o botão de instalação acima ou abra o menu ⋮ do navegador."
                      : "Abra o menu ⋮ do navegador."}
                  </li>
                  <li>
                    Escolha <strong>Instalar app</strong> ou{" "}
                    <strong>Adicionar à tela inicial</strong> e confirme.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    Abra o app no celular usando{" "}
                    <strong>Chrome no Android</strong> ou{" "}
                    <strong>Safari no iPhone</strong>.
                  </li>
                  <li>
                    No Android, escolha <strong>Instalar app</strong> no menu do
                    navegador.
                  </li>
                  <li>
                    No iPhone, toque em{" "}
                    <strong>Compartilhar → Adicionar à Tela de Início</strong>.
                  </li>
                </>
              )}
            </ol>
            <p className="helper-text">
              Depois de instalar, abra pelo ícone. As novas versões chegam
              automaticamente quando você abre ou volta para o app e tem conexão
              com a internet.
            </p>
          </>
        )}
        {installError && (
          <p className="form-error" role="alert">
            {installError}
          </p>
        )}
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setGuide(false);
            dismissOffer();
          }}
        >
          Continuar no navegador
        </button>
      </dialog>
    </Runtime.Provider>
  );
}
