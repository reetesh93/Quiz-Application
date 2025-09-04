import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";

/**********************
 * Utility Functions  *
 **********************/
const decodeHTMLEntities = (str = "") => {
  const txt = typeof document !== "undefined" ? document.createElement("textarea") : null;
  if (!txt) return str;
  txt.innerHTML = str;
  return txt.value;
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**********************
 * Types (JSDoc style) *
 **********************/
/** @typedef {{ question: string, correct_answer: string, incorrect_answers: string[], category?: string, difficulty?: string }} TriviaRaw */
/** @typedef {{ id: string, question: string, options: string[], correct: string, category?: string, difficulty?: string }} TriviaQ */

/**********************
 * Local Fallback     *
 **********************/
const LOCAL_QUESTIONS = /** @type {TriviaQ[]} */ ([
  {
    id: "loc-1",
    question: "What is the capital city of France?",
    options: ["Paris", "Lyon", "Marseille", "Nice"],
    correct: "Paris",
    category: "Geography",
    difficulty: "easy",
  },
  {
    id: "loc-2",
    question: "Which language runs in a web browser?",
    options: ["Java", "C", "Python", "JavaScript"],
    correct: "JavaScript",
    category: "Technology",
    difficulty: "easy",
  },
  {
    id: "loc-3",
    question: "Who painted the Mona Lisa?",
    options: ["Leonardo da Vinci", "Pablo Picasso", "Vincent van Gogh", "Michelangelo"],
    correct: "Leonardo da Vinci",
    category: "Art",
    difficulty: "easy",
  },
  {
    id: "loc-4",
    question: "What does HTTP stand for?",
    options: [
      "HyperText Transfer Protocol",
      "Hyperlink Transfer Protocol",
      "HyperText Transmission Process",
      "HighText Transfer Protocol",
    ],
    correct: "HyperText Transfer Protocol",
    category: "Technology",
    difficulty: "medium",
  },
  {
    id: "loc-5",
    question: "Which planet is known as the Red Planet?",
    options: ["Mars", "Venus", "Jupiter", "Mercury"],
    correct: "Mars",
    category: "Science",
    difficulty: "easy",
  },
]);

/**********************
 * Storage Keys       *
 **********************/
const LS_PROGRESS = "quizapp_progress_v1";
const LS_HIGHSCORES = "quizapp_highscores_v1";

/**********************
 * Shared UI          *
 **********************/
const Container = ({ children }) => (
  <div className="min-h-screen w-screen bg-gray-50 text-gray-400">
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl">Quizzer</Link>
        <nav className="text-sm space-x-4">
          <Link className="hover:underline" to="/quiz">Quiz</Link>
          <Link className="hover:underline" to="/results">Results</Link>
        </nav>
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    <footer className="max-w-3xl mx-auto px-4 py-8 text-center text-xs text-gray-500">
      Built with React hooks • Responsive • Accessible • LocalStorage
    </footer>
  </div>
);

const Card = ({ children }) => (
  <div className="bg-white shadow-sm rounded-2xl p-5 sm:p-6 border">{children}</div>
);

const Button = ({ as: As = "button", className = "", disabled, ...props }) => (
  <As
    className={
      "rounded-2xl px-5 py-3 text-sm font-medium shadow-sm border transition active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-offset-2 " +
      (disabled
        ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
        : "bg-gray-900 text-white border-gray-900 hover:bg-black") +
      (className ? " " + className : "")
    }
    disabled={disabled}
    {...props}
  />
);

const GhostButton = (props) => (
  <Button
    {...props}
    className={(props.className ?? "") + " text-gray-900 border-gray-300 hover:bg-gray-300"}
  />
);

const ProgressBar = ({ value, max }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden" aria-hidden>
      <div className="h-full w-full origin-left bg-gray-900"  style={{ transform: `scaleX(${pct / 100})` }}  />
    </div>
  );
};

const ScoreBadge = ({ score, total }) => (
  <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
    <span className="font-semibold">Score:</span>
    <span className="font-mono">{score}/{total}</span>
  </div>
);

/**********************
 * Data Loading       *
 **********************/
async function fetchTrivia({ amount = 10, difficulty = "easy" }) {
  const url = `https://opentdb.com/api.php?amount=${amount}&type=multiple&encode=url3986&difficulty=${difficulty}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error("Network error");
    const data = await res.json();
    // response_code 0=success, others indicate issues
    if (!data || data.response_code !== 0 || !Array.isArray(data.results) || data.results.length === 0) {
      throw new Error("Empty or invalid data");
    }
    /** @type {TriviaQ[]} */
    const mapped = data.results.map(/** @param {TriviaRaw} r */ (r, idx) => {
      const q = decodeURIComponent(r.question);
      const correct = decodeURIComponent(r.correct_answer);
      const all = shuffle([correct, ...r.incorrect_answers.map((a) => decodeURIComponent(a))]);
      return {
        id: `api-${Date.now()}-${idx}`,
        question: q,
        options: all,
        correct,
        category: r.category ? decodeURIComponent(r.category) : undefined,
        difficulty: r.difficulty,
      };
    });
    return mapped;
  } finally {
    clearTimeout(id);
  }
}

/**********************
 * Home Page          *
 **********************/
const Home = () => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState(10);
  const [difficulty, setDifficulty] = useState("easy");

  const startLocal = () => {
    const payload = {
      source: "local",
      questions: LOCAL_QUESTIONS.slice(0, Math.min(amount, LOCAL_QUESTIONS.length)),
      createdAt: Date.now(),
      current: 0,
      answers: [],
      score: 0,
      settings: { amount, difficulty },
    };
    localStorage.setItem(LS_PROGRESS, JSON.stringify(payload));
    navigate("/quiz");
  };

  const startApi = async () => {
    let questions = [];
    try {
      questions = await fetchTrivia({ amount, difficulty });
    } catch (e) {
      // fallback to local if API fails
      questions = LOCAL_QUESTIONS.slice(0, Math.min(amount, LOCAL_QUESTIONS.length));
    }
    const payload = {
      source: "api",
      questions,
      createdAt: Date.now(),
      current: 0,
      answers: [],
      score: 0,
      settings: { amount, difficulty },
    };
    localStorage.setItem(LS_PROGRESS, JSON.stringify(payload));
    navigate("/quiz");
  };

  return (
    <Container>
      <div className="space-y-6">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Welcome to Quizzer</h1>
              <p className="text-sm text-gray-600 mt-1">Clean, mobile‑friendly quiz app with scoring, results, and more.</p>
            </div>
            <ScoreBadge score={0} total={0} />
          </div>
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="text-sm font-medium">Number of Questions</label>
              <input
                type="number"
                min={5}
                max={10}
                value={amount}
                onChange={(e) => setAmount(Math.max(5, Math.min(10, Number(e.target.value) || 5)))}
                className="mt-2 w-full rounded-xl border px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">Choose between 5 and 10.</p>
            </div>
            <div className="sm:col-span-1">
              <label className="text-sm font-medium">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="mt-2 w-full rounded-xl border px-3 py-2"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Affects API question set.</p>
            </div>
            <div className="sm:col-span-1 flex items-end gap-3">
              <Button onClick={startApi} className="w-full">Start (Open Trivia DB)</Button>
              <Button onClick={startLocal} className="w-full">Start (Local)</Button>
            </div>
          </div>
          <ul className="mt-6 text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>One question at a time with four options.</li>
            <li>Progress bar, timer, keyboard navigation, and accessible controls.</li>
            <li>Final results with correct/incorrect summary and restart.</li>
          </ul>
        </Card>
      </div>
    </Container>
  );
};

/**********************
 * Quiz Page          *
 **********************/
const useProgress = () => {
  const [progress, setProgress] = useState(() => {
    const raw = localStorage.getItem(LS_PROGRESS);
    return raw ? JSON.parse(raw) : null;
  });

  const save = (p) => {
    setProgress(p);
    localStorage.setItem(LS_PROGRESS, JSON.stringify(p));
  };

  return [progress, save];
};

const TIMER_SECONDS = 30;

const Quiz = () => {
  const navigate = useNavigate();
  const [progress, save] = useProgress();
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef(null);

  const total = progress?.questions?.length ?? 0;
  const currentIdx = progress?.current ?? 0;
  const question = progress?.questions?.[currentIdx] ?? null;

  useEffect(() => {
    if (!progress || total === 0) return;
    setSelected(progress.answers?.[currentIdx]?.choice ?? null);
    setLocked(Boolean(progress.answers?.[currentIdx]));
    setSecondsLeft(TIMER_SECONDS);
  }, [currentIdx]);

  useEffect(() => {
    if (!progress || total === 0) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          // auto lock when time runs out
          if (!locked) handleLock();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [progress?.current, locked]);

  if (!progress || total === 0) {
    return (
      <Container>
        <Card>
          <p className="text-sm">No quiz in progress. Start a new one.</p>
          <div className="mt-4">
            <Button as={Link} to="/">Go Home</Button>
          </div>
        </Card>
      </Container>
    );
  }

  const onSelect = (opt) => {
    if (locked) return; // cannot change after lock
    setSelected(opt);
  };

  const handleLock = () => {
    if (locked) return;
    const choice = selected;
    const correct = question.correct;
    const isCorrect = choice === correct;
    const answers = [...(progress.answers || [])];
    answers[currentIdx] = { id: question.id, choice, correct, isCorrect, question: question.question, options: question.options };
    const score = answers.filter((a) => a?.isCorrect).length;
    const next = { ...progress, answers, score };
    save(next);
    setLocked(true);
  };

  const gotoNext = () => {
    if (!locked) return; // prevent without locking
    const nextIdx = currentIdx + 1;
    if (nextIdx >= total) {
      // finish
      const finished = { ...progress, finishedAt: Date.now() };
      save(finished);
      // update highscores
      try {
        const hs = JSON.parse(localStorage.getItem(LS_HIGHSCORES) || "[]");
        hs.push({ score: finished.score, total, date: Date.now(), difficulty: finished.settings?.difficulty, source: finished.source });
        hs.sort((a, b) => b.score - a.score);
        localStorage.setItem(LS_HIGHSCORES, JSON.stringify(hs.slice(0, 20)));
      } catch {}
      navigate("/results");
      return;
    }
    save({ ...progress, current: nextIdx });
  };

  const gotoPrev = () => {
    const prevIdx = Math.max(0, currentIdx - 1);
    save({ ...progress, current: prevIdx });
  };

  const skip = () => {
    if (locked) return; // disallow skip after locking
    const answers = [...(progress.answers || [])];
    answers[currentIdx] = { id: question.id, choice: null, correct: question.correct, isCorrect: false, question: question.question, options: question.options, skipped: true };
    const score = answers.filter((a) => a?.isCorrect).length;
    save({ ...progress, answers, score });
    setLocked(true);
  };

  const restart = () => {
    localStorage.removeItem(LS_PROGRESS);
    navigate("/");
  };

  const pct = (currentIdx + (locked ? 1 : 0)) / total;

  return (
    <Container>
      <div className="space-y-4" role="region" aria-label="Quiz Area">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ScoreBadge score={progress.score || 0} total={total} />
            <div className="text-sm text-gray-600">Question {currentIdx + 1} of {total}</div>
          </div>
          <div className="text-sm" aria-live="polite">⏱ {secondsLeft}s</div>
        </div>
        <ProgressBar value={pct * 100} max={100} />

        <Card>
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">{question.category} • {question.difficulty}</div>
            <h2 className="text-lg sm:text-xl font-semibold" id="question-text">{question.question}</h2>

            <div role="radiogroup" aria-labelledby="question-text" className="grid gap-3">
              {question.options.map((opt) => {
                const isChosen = selected === opt;
                const isCorrect = locked && opt === question.correct;
                const isWrong = locked && isChosen && !isCorrect;
                return (
                  <button
                    key={opt}
                    role="radio"
                    aria-checked={isChosen}
                    onClick={() => onSelect(opt)
                    }
                    className={
                      "text-left rounded-2xl border px-4 py-3 focus:outline-none  " +
                      (isChosen && !locked ? " ring-2 ring-offset-2 " : "") +
                      (locked
                        ? isCorrect
                          ? " bg-green-50 border-green-600"
                          : isWrong
                          ? " bg-red-50 border-red-600"
                          : " bg-gray-50 border-gray-200"
                        : " hover:bg-gray-50 border-gray-200")
                    }
                    disabled={locked}
                  >
                    <span className="font-medium">{opt}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <GhostButton onClick={handleLock} disabled={locked || selected == null}>Lock Answer</GhostButton>
              <Button onClick={gotoNext} disabled={!locked}>{currentIdx + 1 === total ? "Finish" : "Next"}</Button>
              <GhostButton onClick={gotoPrev} disabled={currentIdx === 0}>Previous</GhostButton>
              <GhostButton onClick={skip} disabled={locked}>Skip</GhostButton>
              <GhostButton onClick={restart}>Restart</GhostButton>
            </div>

            {!selected && !locked && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Select an option or use Skip to proceed.</p>
            )}
          </div>
        </Card>

        <p className="text-xs text-gray-500">Tip: You can navigate with the mouse or keyboard. Use Tab to focus options and Enter to lock.</p>
      </div>
    </Container>
  );
};

/**********************
 * Results Page       *
 **********************/
const Results = () => {
  const navigate = useNavigate();
  const [progress] = useProgress();
  const answers = progress?.answers || [];
  const total = progress?.questions?.length || answers.length || 0;
  const score = progress?.score || answers.filter((a) => a?.isCorrect).length;

  const restart = () => {
    localStorage.removeItem(LS_PROGRESS);
    navigate("/");
  };

  const highscores = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_HIGHSCORES) || "[]");
    } catch {
      return [];
    }
  }, []);

  if (!answers || answers.length === 0) {
    return (
      <Container>
        <Card>
          <p className="text-sm">No results to display yet.</p>
          <div className="mt-4 flex gap-3">
            <Button as={Link} to="/quiz">Resume Quiz</Button>
            <GhostButton as={Link} to="/">Home</GhostButton>
          </div>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Results</h2>
              <p className="text-sm text-gray-600">You scored <span className="font-semibold">{score}/{total}</span></p>
              <p className="text-xs text-gray-500">Difficulty: {progress?.settings?.difficulty} • Source: {progress?.source}</p>
            </div>
            <div className="flex gap-2">
              <Button as={Link} to="/quiz">Review</Button>
              <Button onClick={restart}>Restart Quiz</Button>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">Answer Summary</h3>
          <ul className="mt-4 space-y-4">
            {answers.map((a, i) => (
              <li key={a?.id || i} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Question {i + 1}</div>
                    <div className="font-medium">{a?.question}</div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-full border ${a?.isCorrect ? "bg-green-50 border-green-600" : "bg-red-50 border-red-600"}`}>
                    {a?.isCorrect ? "Correct" : a?.skipped ? "Skipped" : "Incorrect"}
                  </div>
                </div>
                <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border p-2">
                    <div className="text-xs text-gray-500">Your answer</div>
                    <div className="font-medium">{a?.choice ?? <span className="text-gray-400">—</span>}</div>
                  </div>
                  <div className="rounded-xl border p-2">
                    <div className="text-xs text-gray-500">Correct answer</div>
                    <div className="font-medium">{a?.correct}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">High Scores (Local)</h3>
          {highscores.length === 0 ? (
            <p className="text-sm text-gray-600">No high scores yet. Finish a quiz to record one.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {highscores.map((h, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl border p-2">
                  <span>#{i + 1} — {h.score}/{h.total} • {h.difficulty} • {new Date(h.date).toLocaleString()}</span>
                  <span className="text-xs text-gray-500">{h.source}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </Container>
  );
};

/**********************
 * App + Router       *
 **********************/
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/results" element={<Results />} />
        <Route path="*" element={<Container><Card><p className="text-sm">Page not found.</p><div className="mt-4"><Button as={Link} to="/">Go Home</Button></div></Card></Container>} />
      </Routes>
    </BrowserRouter>
  );
}
