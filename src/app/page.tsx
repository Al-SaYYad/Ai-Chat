"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./home.module.css";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  pending?: boolean;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: String(Date.now()) + "-u",
      role: "user",
      content: text,
    };
    const tempId = String(Date.now()) + "-ai-temp";
    const aiPending: Message = {
      id: tempId,
      role: "ai",
      content: "",
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, aiPending]);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  content: "حدث خطأ عند الاتصال بمزود AI.",
                  pending: false,
                }
              : m
          )
        );
        console.error("API error:", res.status, errText);
        return;
      }

      const data = await res.json();

      const reply = data?.reply ?? "لم أستلم ردًا واضحًا من خدمة AI.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, content: reply, pending: false } : m
        )
      );
    } catch (err) {
      console.error("Fetch error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, content: "خطأ في الاتصال.", pending: false }
            : m
        )
      );
    }
  };

  const handleSend = () => sendMessage(input);

  return (
    <div className={styles.mainHome}>
      <div className={styles.container}>
        {messages.length === 0 ? (
          <div className={styles.desc}>
            <h1>AI for everything</h1>
            <p>
              AI now has our smartest, fastest, most useful model yet, with
              thinking built in — so you get the best answer, every time.
            </p>
          </div>
        ) : (
          <div className={styles.chatOutput} role="log">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.role === "user" ? styles.userMessage : styles.aiMessage
                }
              >
                {msg.pending ? (
                  <span className={styles.typingDots}>
                    <b>.</b>
                    <b>.</b>
                    <b>.</b>
                  </span>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        <div className={styles.aiInput}>
          <input
            type="text"
            placeholder="Ask anything"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button aria-label="Send message" onClick={handleSend}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 16 16"
              width="22"
              height="22"
            >
              <path d="M16 8A8 8 0 1 0 0 8a8 8 0 0 0 16 0m-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
