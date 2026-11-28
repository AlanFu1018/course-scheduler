"""NCU syllabus -> syllabus_analysis.json. Python standard library only."""

from __future__ import annotations

import argparse
import http.cookiejar
import hashlib
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://cis.ncu.edu.tw"
DEFAULT_MODEL = "openai/gpt-oss-20b"
SCHEMA_VERSION = "2.0"
MAX_REGENERATIONS = 3
OUTPUT_DIR = Path(__file__).resolve().parent / "syllabus_analyses"
PERIOD_ORDER = "1234Z56789ABCD"
# NCU official timetable: https://pdc.adm.ncu.edu.tw/Course/course/COUR_U.pdf
PERIOD_TIMES = {
    "1": ("08:00", "08:50"), "2": ("09:00", "09:50"),
    "3": ("10:00", "10:50"), "4": ("11:00", "11:50"),
    "Z": ("12:00", "12:50"), "5": ("13:00", "13:50"),
    "6": ("14:00", "14:50"), "7": ("15:00", "15:50"),
    "8": ("16:00", "16:50"), "9": ("17:00", "17:50"),
    "A": ("18:00", "18:50"), "B": ("19:00", "19:50"),
    "C": ("20:00", "20:50"), "D": ("21:00", "21:50"),
}
WEEKDAYS = {"Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7}


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[dict[str, str]]] = []
        self.row: list[dict[str, str]] | None = None
        self.cell: dict[str, str] | None = None
        self.links: list[dict[str, str]] = []
        self.link: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "br" and self.cell is not None:
            self.cell["text"] += " "
        elif tag == "tr":
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = {"text": ""}
        elif tag == "a" and self.cell is not None:
            self.link = {"text": "", "href": attr.get("href") or "", "onclick": attr.get("onclick") or ""}

    def handle_data(self, data: str) -> None:
        if self.cell is not None:
            self.cell["text"] += data
        if self.link is not None:
            self.link["text"] += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.link is not None:
            self.links.append(self.link)
            self.link = None
        elif tag in {"td", "th"} and self.cell is not None and self.row is not None:
            self.cell["text"] = " ".join(self.cell["text"].split())
            self.row.append(self.cell)
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def fetch(url: str, opener=None) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "CourseSyllabusExtractor/0.1 (student project)", "Accept": "text/html", "Accept-Language": "zh-TW,zh;q=0.9"})
    context = ssl.create_default_context()
    # Python 3.13 enables OpenSSL's X509_STRICT by default. NCU's certificate
    # chain omits Subject Key Identifier, which strict mode rejects. Keep CA,
    # hostname, expiry, and certificate-chain verification enabled.
    if urllib.parse.urlparse(url).hostname == "cis.ncu.edu.tw":
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    if opener is None:
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context))
    with opener.open(request, timeout=25) as response:
        content_type = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(content_type, errors="replace")


def parse_page(html: str) -> TableParser:
    parser = TableParser()
    parser.feed(html)
    return parser


def source_data(semester: str, serial_no: str) -> tuple[dict, dict, str, str]:
    if not re.fullmatch(r"\d{4}", semester) or not re.fullmatch(r"\d+", serial_no):
        raise ValueError("學期須為四位數（例如 1151），序號須為數字")
    syllabus_url = f"{BASE}/Course/main/query/byKeywords?" + urllib.parse.urlencode({"serialNo": serial_no, "outline": serial_no, "semester": semester})
    context = ssl.create_default_context()
    context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        urllib.request.HTTPSHandler(context=context),
    )
    syllabus_html = fetch(syllabus_url, opener)
    syllabus_rows = parse_page(syllabus_html).rows
    fields = {row[0]["text"]: row[1]["text"] for row in syllabus_rows if len(row) == 2}
    if "Instructor" in fields and "授課教師" not in fields:
        # The site starts in English for some clients. /lang toggles the
        # session locale; retain its cookie and fetch the original Chinese page.
        fetch(f"{BASE}/Course/main/lang", opener)
        syllabus_html = fetch(syllabus_url, opener)
        syllabus_rows = parse_page(syllabus_html).rows
        fields = {row[0]["text"]: row[1]["text"] for row in syllabus_rows if len(row) == 2}
    if fields.get("流水號") != serial_no or fields.get("學期") != semester:
        raise ValueError("課綱頁沒有回傳符合學期與序號的資料")

    year, term = semester[:3], semester[3]
    search_url = f"{BASE}/Course/main/query/byKeywords?" + urllib.parse.urlencode({
        "year": year, "fall_spring": term, "selectDept": "", "keyword": serial_no,
        "week": "", "day": "", "crs_lang_no": "0", "query": "查詢",
    })
    search_page = parse_page(fetch(search_url, opener))
    matching = [row for row in search_page.rows if row and row[0]["text"].split()[:1] == [serial_no]]
    search_fields: dict[str, str] = {}
    if matching:
        row = matching[0]
        if len(row) >= 5:
            search_fields["course_code_and_serial"] = row[0]["text"]
            search_fields["course_name"] = row[1]["text"]
            search_fields["instructor"] = row[2]["text"]
            search_fields["credits"] = row[3]["text"]
            search_fields["session"] = row[4]["text"]
    return fields, search_fields, syllabus_url, search_url


def field_value(fields: dict[str, str], chinese: str, english: str) -> str | None:
    return fields.get(chinese) or fields.get(english)


def parse_sessions(raw: str) -> list[dict]:
    """Convert NCU period codes to occupied time ranges, including short breaks."""
    sessions = []
    for part in re.split(r"\s*[,;；，]\s*", raw.strip()):
        part = re.sub(r"\s*\([^)]*\)\s*$", "", part).strip()
        match = re.fullmatch(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)([1-9ZA-D]+)/([^/]+)", part, re.IGNORECASE)
        if not match:
            raise ValueError(f"無法辨識上課時段：{part}")
        day, codes, room = match.groups()
        codes = codes.upper()
        if len(set(codes)) != len(codes) or any(code not in PERIOD_ORDER for code in codes):
            raise ValueError(f"上課節次重複或未知：{codes}")
        indexes = [PERIOD_ORDER.index(code) for code in codes]
        if indexes != sorted(indexes):
            raise ValueError(f"上課節次順序錯誤：{codes}")
        room = room.strip()
        if not room:
            raise ValueError("缺少上課教室")
        groups = [[codes[0]]]
        for previous, code in zip(codes, codes[1:]):
            if PERIOD_ORDER.index(code) == PERIOD_ORDER.index(previous) + 1:
                groups[-1].append(code)
            else:
                groups.append([code])
        for group in groups:
            sessions.append({"weekday": WEEKDAYS[day.title()],
                             "start_time": PERIOD_TIMES[group[0]][0],
                             "end_time": PERIOD_TIMES[group[-1]][1], "room": room})
    return sessions


def model_schema() -> dict:
    # Keep the model's task small. Deterministic identity fields are filled by Python.
    nullable_string = {"type": ["string", "null"]}
    evidence_value = lambda value: {"type": "object", "properties": {
        "value": value, "status": {"type": "string", "enum": ["confirmed", "estimated"]},
        "evidence": {"type": "string"}}, "required": ["value", "status", "evidence"], "additionalProperties": False}
    return {"type": "object", "properties": {
        "textbook": {"type": "object", "properties": {
            "title": nullable_string, "authors": {"type": "array", "items": {"type": "string"}},
            "edition": {"type": ["integer", "null"]},
            "chapters": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "string"}, "title": {"type": "string"}},
                "required": ["id", "title"], "additionalProperties": False}},
        }, "required": ["title", "authors", "edition", "chapters"], "additionalProperties": False},
        "grading": {"type": "array", "items": {"type": "object", "properties": {
            "category": {"type": "string"}, "weight": evidence_value({"type": ["number", "null"]})},
            "required": ["category", "weight"], "additionalProperties": False}},
        "assessments": {"type": "array", "items": {"type": "object", "properties": {
            "id": {"type": "string"}, "type": {"type": "string"}, "title": {"type": "string"},
            "weight": evidence_value({"type": ["number", "null"]}),
            "date": {"type": "object", "properties": {
                "value": nullable_string, "week": {"type": ["integer", "null"]},
                "status": {"type": "string", "enum": ["confirmed", "estimated"]}, "evidence": {"type": "string"}},
                "required": ["value", "week", "status", "evidence"], "additionalProperties": False},
            "scope": evidence_value({"type": "array", "items": {"type": "string"}}),
            "note": nullable_string},
            "required": ["id", "type", "title", "weight", "date", "scope", "note"], "additionalProperties": False}},
        "weekly_schedule": {"type": "array", "items": {"type": "object", "properties": {
            "week": {"type": "integer"}, "date_range": {"type": "array", "items": {"type": "string"}},
            "topics": {"type": "array", "items": {"type": "string"}},
            "chapters": {"type": "array", "items": {"type": "string"}},
            "status": {"type": "string", "enum": ["confirmed", "estimated"]}},
            "required": ["week", "date_range", "topics", "chapters", "status"], "additionalProperties": False}},
    }, "required": ["textbook", "grading", "assessments", "weekly_schedule"], "additionalProperties": False}


def call_groq(fields: dict, search_fields: dict, api_key: str, model: str,
              feedback: str | None = None) -> dict:
    if not api_key:
        raise ValueError("請提供 Groq API key，或設定 GROQ_API_KEY 環境變數")
    system = ("Extract only facts grounded in the supplied NCU syllabus. Return JSON matching the schema. "
              "Never invent dates, weeks, chapters, weights, or textbook authors. For missing values use null or []. "
              "For date objects with no date, use value:null, week:null, status:estimated, evidence explaining absence. "
              "Keep combined grading categories combined (e.g. HWs+mini-tests 30%); do not split them. "
              "Confirmed requires an exact source quote in evidence. Estimated requires a clear derivation. "
              "Do not treat general teaching topics as textbook chapter IDs. "
              "Only include weekly schedule entries if the syllabus explicitly specifies week-by-week content. "
              "Only include assessments explicitly mentioned. Output JSON only.")
    body = {"model": model, "temperature": 0, "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"syllabus_fields": fields, "search_result": search_fields}, ensure_ascii=False)},
    ], "response_format": {"type": "json_schema", "json_schema": {
        "name": "syllabus_extraction", "strict": True, "schema": model_schema()}}}
    if feedback:
        body["messages"].append({"role": "user", "content":
            f"The previous generation failed validation: {feedback}. Regenerate the complete JSON using only the supplied source."})
    try:
        from groq import Groq, APIStatusError
    except ImportError as exc:
        raise RuntimeError("請先安裝 Groq 官方套件：python -m pip install groq") from exc
    try:
        response = Groq(api_key=api_key, timeout=90.0).chat.completions.create(**body)
    except APIStatusError as exc:
        detail = str(exc)
        if exc.status_code == 403 and "1010" in detail:
            raise RuntimeError("Groq 的 Cloudflare 拒絕了此程式連線（403／1010）。已改用 Groq 官方 Python 套件；若仍出現此錯誤，請聯絡 Groq 支援並提供錯誤代碼。") from exc
        if exc.status_code == 400 and "Generated JSON does not match" in detail:
            raise ValueError("Groq 回傳的 JSON 不符合要求格式") from exc
        raise RuntimeError(f"Groq HTTP {exc.status_code}: {detail[:600]}") from exc
    content = response.choices[0].message.content
    if not content:
        raise ValueError("Groq 沒有回傳 JSON 內容")
    return json.loads(content)


def validate(result: dict, fields: dict) -> None:
    required = {"schema_version", "analysis_id", "course_key", "sources", "model", "created_at", "start_date", "end_date", "course", "grading", "assessments", "weekly_schedule"}
    if not required <= result.keys():
        raise ValueError(f"缺少欄位：{sorted(required - result.keys())}")
    if not isinstance(result["sources"], list) or not result["sources"]:
        raise ValueError("sources 必須是非空清單")
    grading = result["grading"]
    values = [g["weight"]["value"] for g in grading]
    if all(v is not None for v in values) and grading and abs(sum(values) - 100) > 0.01:
        raise ValueError("已知評分比例加總不等於 100")
    grading_text = field_value(fields, "評量配分比重", "Grading") or ""
    for item in grading:
        weight = item["weight"]
        if weight["value"] is not None and weight["status"] == "confirmed":
            # The model may paraphrase its evidence. Accept a confirmed number
            # only when that percentage appears in the source, then store the
            # exact source sentence as the auditable evidence.
            number = f"{weight['value']:g}"
            if not re.search(rf"(?<![\d.]){re.escape(number)}(?:\.0+)?\s*%", grading_text):
                raise ValueError(f"評分 {item['category']} 的 {number}% 不在課綱評分原文中")
            weight["evidence"] = grading_text
    chapter_ids = {c["id"] for c in result["course"]["textbook"]["chapters"]}
    for item in result["assessments"]:
        if not set(item["scope"]["value"]) <= chapter_ids:
            raise ValueError(f"評量 {item['id']} 引用不存在的章節")


def build_result(semester: str, serial_no: str, model: str, fields: dict,
                 search_fields: dict, url: str, search_url: str, extracted: dict) -> dict:
    if not isinstance(extracted, dict):
        raise ValueError("Groq 回傳的資料不是 JSON 物件")
    expected = {"textbook": dict, "grading": list, "assessments": list, "weekly_schedule": list}
    for name, kind in expected.items():
        if not isinstance(extracted.get(name), kind):
            raise ValueError(f"Groq 回傳欄位 {name} 缺失或類型錯誤")
    now = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    code = field_value(fields, "課號", "Course Code") or ""
    result = {
        "schema_version": SCHEMA_VERSION, "analysis_id": "sa_" + hashlib.sha256((url + json.dumps(fields, ensure_ascii=False, sort_keys=True)).encode()).hexdigest()[:12],
        "course_key": f"{semester[:3]}-{semester[3]}_{code}",
        "sources": [
            {"type": "ncu_syllabus", "role": "syllabus", "url": url, "fetched_at": now,
             "raw_text_hash": "sha256:" + hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True).encode()).hexdigest()},
            {"type": "ncu_course_search", "role": "course_schedule", "url": search_url, "fetched_at": now,
             "raw_text_hash": "sha256:" + hashlib.sha256(json.dumps(search_fields, ensure_ascii=False, sort_keys=True).encode()).hexdigest()},
        ],
        "model": model, "created_at": now,
        "start_date": None, "end_date": None,
        "course": {"code": code, "name": field_value(fields, "課程名稱(中文)", "Course Name(Chinese)"),
                   "name_en": field_value(fields, "課程名稱(英文)", "Course Name(English)"),
                   "instructor": field_value(fields, "授課教師", "Instructor"),
                   "credits": int(credit) if (credit := field_value(fields, "學分", "Credit") or "").isdigit() else None,
                   "sessions": [], "textbook": extracted["textbook"]},
        "grading": extracted["grading"], "assessments": extracted["assessments"],
        "weekly_schedule": extracted["weekly_schedule"],
    }
    session = search_fields.get("session", "")
    if session:
        result["course"]["sessions_raw"] = session
        try:
            result["course"]["sessions"] = parse_sessions(session)
        except ValueError as exc:
            result["warnings"] = [str(exc)]
    else:
        result["warnings"] = ["課程查詢結果沒有符合序號的上課時段；sessions 保持空白"]
    validate(result, fields)
    return result


def extract(semester: str, serial_no: str, api_key: str, model: str = DEFAULT_MODEL) -> Path:
    fields, search_fields, url, search_url = source_data(semester, serial_no)
    feedback = None
    for attempt in range(MAX_REGENERATIONS + 1):
        try:
            extracted = call_groq(fields, search_fields, api_key, model, feedback)
            result = build_result(semester, serial_no, model, fields, search_fields,
                                  url, search_url, extracted)
            break
        except (ValueError, TypeError, KeyError) as exc:
            if attempt == MAX_REGENERATIONS:
                raise RuntimeError(f"Groq 回傳格式經 {MAX_REGENERATIONS + 1} 次生成仍無法通過驗證：{exc}") from exc
            feedback = str(exc)[:300]
    output = OUTPUT_DIR / f"{semester}_{serial_no}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="擷取中央大學課綱並輸出至 syllabus_analyses/{學期}_{課程序號}.json")
    parser.add_argument("--semester", default="1151")
    parser.add_argument("--serial-no", default="52016")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--gui", action="store_true")
    args = parser.parse_args()
    if args.gui:
        from gui import launch
        launch()
        return
    try:
        output = extract(args.semester, args.serial_no, os.getenv("GROQ_API_KEY", ""), args.model)
        print(output)
        for warning in json.loads(output.read_text(encoding="utf-8")).get("warnings", []):
            print(f"提醒：{warning}", file=sys.stderr)
    except Exception as exc:
        print(f"擷取失敗：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
