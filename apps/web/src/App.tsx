import './App.css'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="dot" />
          <div>
            <div className="title">Raka</div>
            <div className="subtitle">secure-ish messenger (MVP)</div>
          </div>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <div className="sidebarHeader">Chats</div>
          <div className="chatItem active">
            <div className="avatar">S</div>
            <div className="chatMeta">
              <div className="chatName">Signal-like UI (soon)</div>
              <div className="chatLast">Login + 1:1 chat next</div>
            </div>
          </div>
        </aside>

        <section className="chat">
          <div className="chatHeader">
            <div className="chatTitle">Welcome</div>
            <div className="chatStatus">dark theme enabled</div>
          </div>

          <div className="messages">
            <div className="bubble them">Скоро будет авторизация по телефону (+7...) и чат 1:1.</div>
            <div className="bubble me">Ок, делаем.</div>
          </div>

          <div className="composer">
            <input placeholder="Message…" disabled />
            <button disabled>Send</button>
          </div>
        </section>
      </main>
    </div>
  )
}
