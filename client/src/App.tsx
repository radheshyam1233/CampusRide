import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bike,
  Search,
  Plus,
  Heart,
  MapPin,
  SlidersHorizontal,
  X,
  Check,
  LogOut,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
} from "lucide-react";
import { api, setCSRF, type Listing, type User } from "./api";
const hosted = import.meta.env.VITE_CAMPUSRIDE_HOSTED === "1";
const money = (n: number) => "₹" + n.toLocaleString("en-IN");
function RidePhoto({
  ride,
  index = 0,
  detail = false,
}: {
  ride: Listing;
  index?: number;
  detail?: boolean;
}) {
  const url = ride.photos[index]
    ? "/api/photos/" + ride.photos[index]
    : ride.previewImage;
  if (url)
    return (
      <img
        className={detail ? "detail-photo" : undefined}
        src={url}
        alt={ride.title}
        loading={detail ? "eager" : "lazy"}
      />
    );
  return (
    <span
      className={`ride-placeholder ${ride.category === "Scooty" ? "scooter" : ""} ${detail ? "detail-photo" : ""}`}
    >
      {ride.category === "Scooty" ? (
        <ScooterIcon />
      ) : (
        <Bike size={52} strokeWidth={1.3} aria-hidden="true" />
      )}
      <span>No photo provided</span>
    </span>
  );
}
function ScooterIcon() {
  return (
    <svg
      width="55"
      height="53"
      viewBox="0 0 48 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="11" cy="34" r="5" />
      <circle cx="37" cy="34" r="5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 30l2-8c.4-1.7 1.6-2.5 3.3-2.5H19l5 11h8l-2-18h5l4 14m-9-14-2-7h-5M10 19.5h10l3 4h-3m-4 10.5h16"
      />
    </svg>
  );
}
type FieldProps = React.ComponentPropsWithoutRef<"input"> & {
  label: string;
  children?: React.ReactNode;
};
function FormField({ children, label, ...props }: FieldProps) {
  return (
    <label>
      {label}
      {children || <input {...props} />}
    </label>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [rows, setRows] = useState<Listing[]>([]),
    [savedRows, setSavedRows] = useState<Listing[]>([]),
    [total, setTotal] = useState(0),
    [pages, setPages] = useState(0),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All rides"),
    [sort, setSort] = useState("newest"),
    [budget, setBudget] = useState("all"),
    [view, setView] = useState("browse"),
    [saved, setSaved] = useState<string[]>(() => {
      try {
        const ids: unknown = JSON.parse(
          localStorage.getItem("campusride-saved") || "[]",
        );
        if (!Array.isArray(ids)) return [];
        const examples: Record<string, string> = {
          demo1: "example-firefox",
          demo2: "example-activa",
          demo3: "example-hero",
        };
        return [
          ...new Set(
            ids
              .filter((id): id is string => typeof id === "string")
              .map((id) =>
                hosted && Object.hasOwn(examples, id) ? examples[id] : id,
              ),
          ),
        ];
      } catch {
        return [];
      }
    }),
    [modal, setModal] = useState<"sell" | "auth" | "how" | Listing | null>(
      null,
    ),
    [editing, setEditing] = useState<Listing | null>(null),
    [authMode, setAuthMode] = useState("login"),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [reload, setReload] = useState(0),
    [deleteId, setDeleteId] = useState(""),
    [photoIndex, setPhotoIndex] = useState(0),
    [uploadIds, setUploadIds] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const clickedControl = useRef<HTMLElement | null>(null);
  const refreshBrowse = useRef<(() => void) | null>(null);
  function rememberTrigger(event: React.MouseEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof Element) {
      clickedControl.current = target.closest("button, a");
    }
  }
  const modalOpen = Boolean(modal);
  useEffect(() => {
    api("/auth/me")
      .then((d) => {
        setUser(d.user);
        setCSRF(d.csrf);
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    let loadingRows = false;
    let refreshQueued = false;
    async function load(background = false) {
      if (loadingRows) {
        refreshQueued = true;
        return;
      }
      loadingRows = true;
      if (!background) {
        setLoading(true);
        setLoadError("");
      }
      try {
        let data;
        if (view === "mine") {
          if (!user) {
            setRows([]);
            setTotal(0);
            setPages(0);
            return;
          }
          data = await api("/listings/mine", { signal: controller.signal });
        } else {
          const params = new URLSearchParams({
            sort,
            page: String(page),
            limit: "12",
          });
          if (search) params.set("search", search);
          if (category !== "All rides") params.set("category", category);
          if (budget !== "all") params.set("maxPrice", budget);
          data = await api("/listings?" + params, { signal: controller.signal });
        }
        if (!controller.signal.aborted) {
          const pageCount = data.pages ?? 1;
          setRows(data.listings);
          setTotal(data.total ?? data.listings.length);
          setPages(pageCount);
          setLoadError("");
          if (view === "browse" && page > Math.max(1, pageCount)) {
            setPage(Math.max(1, pageCount));
          }
        }
      } catch (e) {
        if (!controller.signal.aborted && !background)
          setLoadError((e as Error).message);
      } finally {
        loadingRows = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (refreshQueued) {
            refreshQueued = false;
            void load(true);
          }
        }
      }
    }
    if (view === "browse") refreshBrowse.current = () => void load(true);
    void load();
    return () => {
      refreshBrowse.current = null;
      controller.abort();
    };
  }, [view, category, sort, budget, search, page, reload, user]);
  useEffect(() => {
    if (view !== "browse") return;

    function refresh() {
      if (!document.hidden) refreshBrowse.current?.();
    }

    const updates =
      !hosted && typeof EventSource !== "undefined"
        ? new EventSource("/api/listings/events")
        : null;
    updates?.addEventListener("open", refresh);
    updates?.addEventListener("listings-updated", refresh);
    const timer = window.setInterval(refresh, updates ? 15_000 : 5_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      updates?.close();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [view]);
  useEffect(() => {
    try {
      localStorage.setItem("campusride-saved", JSON.stringify(saved));
    } catch {}
  }, [saved]);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = clickedControl.current;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [modalOpen]);
  function handleDialogKey(e: React.KeyboardEvent) {
    if (e.key === "Escape" && !busy) {
      setModal(null);
      setDeleteId("");
    }
    if (e.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    if (!controls?.length) return;
    const first = controls[0],
      last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  useEffect(() => {
    setSavedRows((prev) => {
      const map = new Map(prev.map((l) => [l.id, l]));
      rows.forEach((l) => {
        if (saved.includes(l.id)) map.set(l.id, l);
      });
      return [...map.values()].filter((l) => saved.includes(l.id));
    });
  }, [rows, saved]);
  // Fetch saved rides by ID so favourites survive page changes and browser reloads.
  useEffect(() => {
    if (view !== "saved" || !user) return;
    let active = true;
    Promise.allSettled(saved.map((id) => api("/listings/" + id))).then(
      (results) => {
        if (active)
          setSavedRows(
            results.flatMap((r) =>
              r.status === "fulfilled" ? [r.value.listing] : [],
            ),
          );
      },
    );
    return () => {
      active = false;
    };
  }, [view, saved, user, reload]);
  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  }
  function navigate(v: string) {
    setView(v);
    setPage(1);
    setSearch("");
    setQuery("");
    setCategory("All rides");
    setBudget("all");
    document.getElementById("market")?.scrollIntoView();
  }
  function favorite(id: string) {
    setSaved((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function openSell(l: Listing | null = null) {
    setError("");
    setEditing(l);
    setUploadIds(l?.photos || []);
    setModal(user ? "sell" : "auth");
    setAuthMode("login");
  }
  async function openDetail(l: Listing) {
    setError("");
    setPhotoIndex(0);
    setDeleteId("");
    setModal({ ...l, contact: user ? l.contact : undefined });
    if (!user || l.sample) return;
    try {
      const d = await api("/listings/" + l.id);
      setModal((current) =>
        typeof current === "object" && current?.id === l.id
          ? d.listing
          : current,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const d = await api(
        "/auth/" + (authMode === "signup" ? "signup" : "login"),
        { method: "POST", body: JSON.stringify(f) },
      );
      setUser(d.user);
      setCSRF(d.csrf);
      setModal(null);
      notify("Welcome " + d.user.name + "!");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (hosted) {
      window.location.assign("/signout-with-chatgpt?return_to=/");
      return;
    }
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setCSRF("");
      navigate("browse");
      notify("You are logged out.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setError("");
    try {
      if (uploadIds.length + files.length > 4)
        throw Error("Add up to 4 photos.");
      const ids = [...uploadIds];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024)
          throw Error("Each photo must be under 5 MB.");
        const f = new FormData();
        f.append("photo", file);
        const d = await api("/photos", { method: "POST", body: f });
        ids.push(d.id);
        setUploadIds([...ids]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function post(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const d: any = Object.fromEntries(new FormData(e.currentTarget));
      d.price = Number(d.price);
      if (d.year) d.year = Number(d.year);
      else if (editing) d.year = null;
      else delete d.year;
      d.photos = uploadIds;
      await api("/listings" + (editing ? "/" + editing.id : ""), {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(d),
      });
      setModal(null);
      setEditing(null);
      setReload((x) => x + 1);
      navigate("mine");
      notify(editing ? "Listing updated." : "Your ride is listed!");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(l: Listing) {
    setBusy(true);
    try {
      await api("/listings/" + l.id, {
        method: "PATCH",
        body: JSON.stringify({
          status: l.status === "sold" ? "available" : "sold",
        }),
      });
      setModal(null);
      setReload((x) => x + 1);
      notify(
        l.status === "sold"
          ? "Your ride is available again."
          : "Marked as sold!",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(l: Listing) {
    setBusy(true);
    try {
      await api("/listings/" + l.id, { method: "DELETE" });
      setSaved((p) => p.filter((id) => id !== l.id));
      setModal(null);
      setDeleteId("");
      setReload((x) => x + 1);
      notify("Listing deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const list = view === "saved" ? savedRows : rows;
  const shown =
    view === "browse"
      ? list
      : list
          .filter(
            (r) =>
              (category === "All rides" || r.category === category) &&
              `${r.title} ${r.location} ${r.description}`
                .toLowerCase()
                .includes(search.toLowerCase()) &&
              (budget === "all" || r.price <= Number(budget)),
          )
          .sort((a, b) =>
            sort === "low"
              ? a.price - b.price
              : sort === "high"
                ? b.price - a.price
                : Date.parse(b.createdAt) - Date.parse(a.createdAt),
          );
  const resultCount = view === "browse" ? total : shown.length;
  return (
    <>
      <header inert={modalOpen} onClickCapture={rememberTrigger}>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Bike size={25} />
          </span>
          Campus<span>Ride</span>
          <i> / </i>
          <small>IIT BHU</small>
        </a>
        <nav>
          <button
            className={view === "browse" ? "active" : ""}
            onClick={() => navigate("browse")}
          >
            Explore rides
          </button>
          <button
            className={view === "saved" ? "active" : ""}
            onClick={() => navigate("saved")}
          >
            Saved {saved.length || ""}
          </button>
          <button
            className={view === "mine" ? "active" : ""}
            onClick={() => navigate("mine")}
          >
            My listings
          </button>
          <button
            onClick={() => {
              setError("");
              setModal("how");
            }}
          >
            How it works
          </button>
        </nav>
        <div className="header-actions">
          {user ? (
            <button
              className="logout"
              aria-label="Log out"
              title={"Log out " + user.name}
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          ) : (
            <button
              className="login-link"
              disabled={!authReady}
              onClick={() => {
                setAuthMode("login");
                setError("");
                setModal("auth");
              }}
            >
              Log in
            </button>
          )}
          <button
            className="primary"
            onClick={() => openSell()}
            disabled={!authReady}
          >
            <Plus size={17} /> Sell your ride
          </button>
        </div>
      </header>
      <main inert={modalOpen} onClickCapture={rememberTrigger}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow hero-campus">
              <MapPin size={16} /> IIT BHU · Varanasi
            </div>
            <h1 id="hero-title">
              Find your next <em>campus ride.</em>
            </h1>
            <p>
              Buy and sell used cycles and scooters with students at IIT BHU.
            </p>
            <a className="cream-button" href="#market">
              Browse listings
            </a>
          </div>
          <div className="hero-image">
            <img
              src="/images/campus-cycle.jpg"
              alt="A bicycle parked outdoors"
            />
          </div>
        </section>
        <section id="market" className="market">
          <div className="section-heading">
            <h2>
              {view === "saved"
                ? "Saved rides"
                : view === "mine"
                  ? "My listings"
                  : "Explore rides"}
            </h2>
          </div>
          <div className="toolbar">
            <div className="tabs">
              {["All rides", "Cycle", "Scooty"].map((c) => (
                <button
                  key={c}
                  className={category === c ? "selected" : ""}
                  aria-pressed={category === c}
                  onClick={() => {
                    setCategory(c);
                    setPage(1);
                  }}
                >
                  {c === "Cycle" ? <Bike size={17} /> : null}
                  {c === "Cycle" ? "Cycles" : c === "Scooty" ? "Scooties" : c}
                </button>
              ))}
            </div>
            <div className="tools">
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search rides"
                  placeholder="Search a ride or hostel..."
                  value={query}
                  maxLength={100}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="budget">
                <SlidersHorizontal size={16} />
                <select
                  aria-label="Budget"
                  value={budget}
                  onChange={(e) => {
                    setBudget(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Budget</option>
                  <option value="5000">Up to ₹5,000</option>
                  <option value="10000">Up to ₹10,000</option>
                  <option value="50000">Up to ₹50,000</option>
                </select>
              </label>
            </div>
          </div>
          <div className="results">
            <span role="status">
              {loading
                ? "Loading rides…"
                : `${resultCount} ${resultCount === 1 ? "ride" : "rides"}`}
            </span>
            <label>
              Sort by:{" "}
              <select
                aria-label="Sort listings"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="newest">Newest first</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
              </select>
            </label>
          </div>
          {loadError && (
            <div role="alert" className="error">
              {loadError}{" "}
              <button onClick={() => setReload((x) => x + 1)}>Retry</button>
            </div>
          )}
          {(view === "mine" || view === "saved") && !user ? (
            <div className="empty">
              <Bike size={40} />
              <h3>Make yourself at home.</h3>
              <p>
                Log in to{" "}
                {view === "mine"
                  ? "manage your listings"
                  : "view saved rides and contact sellers"}
                .
              </p>
              <button
                className="primary"
                onClick={() => {
                  setAuthMode("login");
                  setError("");
                  setModal("auth");
                }}
              >
                Log in{" "}
              </button>
            </div>
          ) : (
            <>
              <div className="grid">
                {shown.map((r) => (
                  <article className="card" key={r.id}>
                    <div className="card-photo">
                      <button
                        className="photo-open"
                        aria-label={"View " + r.title}
                        onClick={() => openDetail(r)}
                      >
                        <RidePhoto ride={r} />
                      </button>
                      <span className="condition">
                        {r.sample
                          ? "Sample listing"
                          : r.status === "sold"
                            ? "Sold"
                            : r.condition}
                      </span>
                      <button
                        className={
                          "heart " + (saved.includes(r.id) ? "hearted" : "")
                        }
                        aria-pressed={saved.includes(r.id)}
                        aria-label={
                          (saved.includes(r.id) ? "Unsave " : "Save ") + r.title
                        }
                        onClick={() => favorite(r.id)}
                      >
                        <Heart
                          size={19}
                          fill={saved.includes(r.id) ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <div className="card-body">
                      <div className="card-category">
                        {r.category}
                        <span>
                          {r.sample
                            ? ""
                            : "• " +
                              new Date(r.createdAt).toLocaleDateString(
                                "en-IN",
                                { day: "numeric", month: "short" },
                              )}
                        </span>
                      </div>
                      <button
                        className="card-title"
                        onClick={() => openDetail(r)}
                      >
                        {r.title}
                      </button>
                      <div className="card-price">
                        {money(r.price)}
                        <span>Asking price</span>
                      </div>
                      <div className="card-footer">
                        <span>
                          <MapPin size={14} />
                          {r.location}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!loading && !shown.length && !loadError && (
                <div className="empty">
                  <Bike size={40} />
                  <h3>
                    {view === "saved"
                      ? "Keep your favourites close."
                      : "No rides found."}
                  </h3>
                  <p>
                    {view === "saved"
                      ? "Tap the heart on any ride to save it."
                      : "No matching rides yet. Try another search, or list the first one."}
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      view === "mine" ? openSell() : navigate("browse")
                    }
                  >
                    {view === "mine" ? "List your ride" : "Explore all rides"}
                  </button>
                </div>
              )}
            </>
          )}
          {view === "browse" && pages > 1 && (
            <div className="pagination">
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button
                className="secondary"
                disabled={page === pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
        <footer>
          <a className="brand" href="/">
            Campus<span>Ride</span>
            <small>IIT BHU</small>
          </a>
          <button onClick={() => setModal("how")}>How it works</button>
        </footer>
      </main>
      {modal && (
        <div
          className="overlay"
          onClick={() => {
            if (!busy) {
              setModal(null);
              setDeleteId("");
            }
          }}
        >
          <div
            className="modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleDialogKey}
          >
            <button
              autoFocus
              className="close"
              disabled={busy}
              aria-label="Close dialog"
              onClick={() => {
                setModal(null);
                setDeleteId("");
              }}
            >
              <X />
            </button>
            {modal === "auth" ? (
              <>
                <h2 id="dialog-title">
                  {hosted
                    ? "Sign in"
                    : authMode === "signup"
                      ? "Create your account"
                      : "Log in"}
                </h2>
                {hosted ? (
                  <a
                    className="primary"
                    href="/signin-with-chatgpt?return_to=/"
                    target="_top"
                  >
                    Continue with ChatGPT
                  </a>
                ) : (
                  <>
                    <form onSubmit={authenticate}>
                      {authMode === "signup" && (
                        <FormField
                          label="Your name"
                          name="name"
                          required
                          minLength={2}
                          maxLength={80}
                          autoComplete="name"
                        />
                      )}
                      <FormField
                        label="Email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                      />
                      <FormField
                        label="Password"
                        name="password"
                        type="password"
                        required
                        minLength={authMode === "signup" ? 10 : 1}
                        maxLength={72}
                        autoComplete={
                          authMode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                      />
                      {authMode === "signup" && (
                        <small>Use at least 10 characters.</small>
                      )}
                      {error && (
                        <p className="error" role="alert">
                          {error}
                        </p>
                      )}
                      <button className="primary" disabled={busy}>
                        {busy
                          ? "Please wait…"
                          : authMode === "signup"
                            ? "Create account"
                            : "Log in"}
                      </button>
                    </form>
                    <button
                      className="auth-switch"
                      onClick={() => {
                        setAuthMode(authMode === "signup" ? "login" : "signup");
                        setError("");
                      }}
                    >
                      {authMode === "signup"
                        ? "Already have an account? Log in"
                        : "New here? Create an account"}
                    </button>
                  </>
                )}
              </>
            ) : modal === "how" ? (
              <>
                <h2 id="dialog-title">How CampusRide works</h2>
                <p>
                  CampusRide helps IIT BHU students find pre-owned cycles and
                  scooties nearby. CampusRide is an independent student project.
                </p>
                <ol>
                  <li>
                    <strong>Discover a ride.</strong> Filter by vehicle type and
                    budget. Save your favourites.
                  </li>
                  <li>
                    <strong>Meet the seller.</strong> Log in, view their contact
                    details and arrange a campus meetup.
                  </li>
                  <li>
                    <strong>Check it. Then ride it.</strong> Inspect the
                    vehicle, agree on a price and pay the seller directly.
                  </li>
                </ol>
                <p className="tip">
                  Check the scooter’s documents before arranging a purchase.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setModal(null);
                    navigate("browse");
                  }}
                >
                  Explore rides{" "}
                </button>
              </>
            ) : modal === "sell" ? (
              <>
                <h2 id="dialog-title">
                  {editing ? "Edit your listing" : "Sell your ride"}
                </h2>
                <form onSubmit={post} key={editing?.id || "new"}>
                  <FormField
                    label="Listing title"
                    name="title"
                    required
                    minLength={5}
                    maxLength={100}
                    defaultValue={editing?.title}
                    placeholder="e.g. Firefox 21-speed cycle"
                  />
                  <div className="form-row">
                    <FormField label="Type">
                      <select name="category" defaultValue={editing?.category}>
                        <option>Cycle</option>
                        <option>Scooty</option>
                      </select>
                    </FormField>
                    <FormField
                      label="Asking price (₹)"
                      name="price"
                      type="number"
                      min="1"
                      max="500000"
                      required
                      defaultValue={editing?.price}
                      placeholder="6500"
                    />
                  </div>
                  <div className="form-row">
                    <FormField label="Condition">
                      <select
                        name="condition"
                        defaultValue={editing?.condition}
                      >
                        <option>Like new</option>
                        <option>Good</option>
                        <option>Fair</option>
                        <option>Needs repair</option>
                      </select>
                    </FormField>
                    <FormField
                      label="Year (optional)"
                      name="year"
                      type="number"
                      min="1980"
                      max={new Date().getFullYear() + 1}
                      defaultValue={editing?.year ?? undefined}
                    />
                  </div>
                  <FormField
                    label="Hostel / meetup location"
                    name="location"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Limbdi Hostel"
                    defaultValue={editing?.location}
                  />
                  <FormField label="About your ride">
                    <textarea
                      name="description"
                      required
                      minLength={20}
                      maxLength={3000}
                      defaultValue={editing?.description}
                      placeholder="Age, condition, service history, accessories…"
                    />
                  </FormField>
                  <FormField
                    label="Contact email or phone"
                    name="contact"
                    required
                    maxLength={100}
                    defaultValue={editing?.contact}
                  />
                  <div className="upload-label">
                    <ImagePlus size={17} />
                    <span>Add up to 4 photos · JPG, PNG, WebP · 5 MB each</span>
                    <input
                      aria-label="Vehicle photos"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={busy || uploadIds.length >= 4}
                      onChange={(e) => {
                        upload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <div className="photo-thumbs">
                    {uploadIds.map((id, i) => (
                      <div key={id}>
                        <img
                          src={"/api/photos/" + id}
                          alt={"Vehicle photo " + (i + 1)}
                        />
                        <button
                          type="button"
                          aria-label={"Remove photo " + (i + 1)}
                          disabled={busy}
                          onClick={() =>
                            setUploadIds((ids) => ids.filter((x) => x !== id))
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <small>
                    Choose a public meetup spot. Signed-in members can see your
                    contact details.
                  </small>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button disabled={busy} className="primary" type="submit">
                    {busy
                      ? "Saving…"
                      : editing
                        ? "Save changes"
                        : "Publish listing"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="detail-gallery">
                  <RidePhoto ride={modal} index={photoIndex} detail />
                  {modal.photos.length > 1 && (
                    <div className="gallery-controls">
                      <button
                        aria-label="Previous photo"
                        onClick={() =>
                          setPhotoIndex(
                            (i) =>
                              (i + modal.photos.length - 1) %
                              modal.photos.length,
                          )
                        }
                      >
                        <ChevronLeft />
                      </button>
                      <span>
                        {photoIndex + 1} / {modal.photos.length}
                      </span>
                      <button
                        aria-label="Next photo"
                        onClick={() =>
                          setPhotoIndex((i) => (i + 1) % modal.photos.length)
                        }
                      >
                        <ChevronRight />
                      </button>
                    </div>
                  )}
                </div>
                <div className="eyebrow dark">
                  {modal.category} · {modal.condition}{" "}
                  {modal.year ? "· " + modal.year : ""} ·{" "}
                  {modal.sample ? "Sample listing" : modal.status}
                </div>
                <h2 id="dialog-title">{modal.title}</h2>
                <div className="detail-price">{money(modal.price)}</div>
                <p>
                  <MapPin size={16} /> {modal.location}
                </p>
                <p className="description">{modal.description}</p>
                <div className="seller">
                  <strong>{modal.seller.name}</strong>
                  <span>
                    {modal.sample
                      ? "This ride is for demonstration only."
                      : modal.contact ||
                        (!user
                          ? "Log in to see seller contact details."
                          : error
                            ? "Contact details unavailable."
                            : "Loading contact details…")}
                  </span>
                </div>
                <div className="detail-actions">
                  <button
                    className="secondary"
                    onClick={() => favorite(modal.id)}
                  >
                    <Heart size={17} />
                    {saved.includes(modal.id) ? "Saved" : "Save ride"}
                  </button>
                  {!modal.sample && !user && (
                    <button
                      className="primary"
                      onClick={() => {
                        setAuthMode("login");
                        setModal("auth");
                      }}
                    >
                      Log in to contact
                    </button>
                  )}
                  {modal.contact && modal.status === "available" && (
                    <a
                      className="primary"
                      href={
                        modal.contact.includes("@")
                          ? "mailto:" +
                            encodeURIComponent(modal.contact).replace(
                              "%40",
                              "@",
                            )
                          : "tel:" + modal.contact.replace(/[^+0-9]/g, "")
                      }
                    >
                      Contact seller{" "}
                    </a>
                  )}
                  {Boolean(user) && modal.seller.id === user?.id && (
                    <>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => openSell(modal)}
                      >
                        <Pencil size={15} /> Edit
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => changeStatus(modal)}
                      >
                        <Check size={16} />
                        {modal.status === "sold" ? "Relist" : "Mark sold"}
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => setDeleteId(modal.id)}
                      >
                        <Trash2 size={15} /> Delete
                      </button>
                    </>
                  )}
                </div>
                {deleteId === modal.id && (
                  <div className="delete-confirm">
                    <strong>Delete this listing and its photos?</strong>
                    <p>This cannot be undone.</p>
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => remove(modal)}
                    >
                      Yes, delete listing
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setDeleteId("")}
                    >
                      Keep listing
                    </button>
                  </div>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <p className="tip">
                  Meet on campus, inspect the ride and agree on payment directly
                  with the seller.
                </p>
              </>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </>
  );
}
