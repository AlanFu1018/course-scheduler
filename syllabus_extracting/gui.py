"""Small Tkinter front end for extract.py."""

from __future__ import annotations

import os
import threading
import tkinter as tk
from tkinter import messagebox, ttk

from extract import DEFAULT_MODEL, extract


def launch() -> None:
    root = tk.Tk()
    root.title("中央大學課綱擷取")
    root.geometry("580x250")
    root.columnconfigure(1, weight=1)

    semester = tk.StringVar(value="1151")
    serial_no = tk.StringVar(value="52016")
    model = tk.StringVar(value=DEFAULT_MODEL)
    key = tk.StringVar(value=os.getenv("GROQ_API_KEY", ""))
    status = tk.StringVar(value="請輸入課程資料後按「擷取」。")

    for row, (label, variable) in enumerate([
        ("學期", semester), ("課程序號", serial_no), ("Groq 模型", model),
        ("Groq API key", key),
    ]):
        ttk.Label(root, text=label).grid(row=row, column=0, sticky="w", padx=12, pady=7)
        entry = ttk.Entry(root, textvariable=variable, show="*" if label == "Groq API key" else "")
        entry.grid(row=row, column=1, sticky="ew", padx=8, pady=7)

    def run() -> None:
        button.configure(state="disabled")
        status.set("正在抓取課綱並呼叫 Groq…")
        values = (semester.get().strip(), serial_no.get().strip(), key.get().strip(), model.get().strip())

        def worker() -> None:
            try:
                saved = extract(*values)
            except Exception as exc:
                root.after(0, lambda err=str(exc): finish_error(err))
            else:
                root.after(0, lambda path=str(saved): finish_success(path))

        threading.Thread(target=worker, daemon=True).start()

    def finish_error(error: str) -> None:
        button.configure(state="normal")
        status.set("擷取失敗。")
        messagebox.showerror("擷取失敗", error)

    def finish_success(path: str) -> None:
        button.configure(state="normal")
        status.set(f"已儲存：{path}")
        messagebox.showinfo("完成", f"已產生\n{path}")

    button = ttk.Button(root, text="擷取並產生 JSON", command=run)
    button.grid(row=4, column=1, sticky="e", padx=8, pady=12)
    ttk.Label(root, textvariable=status, wraplength=540).grid(row=5, column=0, columnspan=2, sticky="w", padx=12)
    root.mainloop()


if __name__ == "__main__":
    launch()
