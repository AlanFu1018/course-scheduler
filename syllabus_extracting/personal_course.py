"""User course storage and validation, independent of the browser UI."""
from __future__ import annotations

import copy
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from extract import OUTPUT_DIR, fetch, parse_page, BASE, analysis_filename
from urllib.parse import urlencode

COURSES_DIR = Path(__file__).resolve().parent / "user_courses"
USER_ID = "demo_user"


def search_courses(semester: str, keyword: str) -> list[dict]:
    if not re.fullmatch(r"\d{4}", semester) or not keyword.strip():
        raise ValueError("請輸入四位數學期與搜尋關鍵字")
    url = f"{BASE}/Course/main/query/byKeywords?" + urlencode({
        "year": semester[:3], "fall_spring": semester[3], "selectDept": "",
        "keyword": keyword.strip(), "week": "", "day": "", "crs_lang_no": "0", "query": "查詢"})
    results = []
    for row in parse_page(fetch(url)).rows:
        if len(row) < 5:
            continue
        match = re.match(r"^(\d+)\s+(.+)$", row[0]["text"])
        if match:
            serial, code = match.groups()
            results.append({"semester": semester, "serial_no": serial, "code": code,
                            "name": row[1]["text"], "instructor": row[2]["text"],
                            "credits": row[3]["text"], "sessions_raw": row[4]["text"],
                            "analysis_exists": analysis_path(semester, serial) is not None})
    return results


def analysis_path(semester: str, serial_no: str) -> Path | None:
    for path in OUTPUT_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            syllabus = next(s for s in data["sources"] if s["role"] == "syllabus")
            query = parse_qs(urlparse(syllabus["url"]).query)
            if query.get("semester") == [semester] and query.get("serialNo") == [serial_no]:
                if path.name != analysis_filename(data["course_key"]):
                    continue
                return path
        except (ValueError, KeyError, StopIteration, TypeError):
            continue
    return None


def analysis_for(semester: str, serial_no: str, api_key: str = "") -> dict:
    if not re.fullmatch(r"\d{4}", semester) or not re.fullmatch(r"\d+", serial_no):
        raise ValueError("學期或序號格式錯誤")
    path = analysis_path(semester, serial_no)
    if path is not None:
        data = json.loads(path.read_text(encoding="utf-8"))
        required = {"analysis_id", "course_key", "sources", "course", "grading", "assessments", "weekly_schedule", "start_date", "end_date"}
        if data.get("schema_version") != "2.0" or not required <= data.keys() or not data.get("analysis_id") or not data.get("course_key") or not isinstance(data["sources"], list) or not isinstance(data["course"], dict):
            raise ValueError("既有分析檔不是有效的 2.0 分析，請先移走或修復")
        return data
    from extract import extract
    extract(semester, serial_no, api_key)
    return analysis_for(semester, serial_no)


def course_path(user_id: str, analysis: dict) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", user_id):
        raise ValueError("使用者 ID 只能使用英文字母、數字、底線與連字號")
    return COURSES_DIR / user_id / analysis_filename(analysis["course_key"])


def draft_course(analysis: dict, user_id: str = USER_ID) -> dict:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return {"schema_version": "2.0", "user_id": user_id, "course_key": analysis["course_key"],
            "source": {"analysis_id": analysis["analysis_id"], "sources": copy.deepcopy(analysis["sources"])},
            "start_date": analysis["start_date"], "end_date": analysis["end_date"],
            "course": copy.deepcopy(analysis["course"]), "grading": copy.deepcopy(analysis["grading"]),
            "assessments": copy.deepcopy(analysis["assessments"]),
            "weekly_schedule": copy.deepcopy(analysis["weekly_schedule"]),
            "created_at": now, "updated_at": now}


def read_course(user_id: str, analysis: dict) -> dict | None:
    path = course_path(user_id, analysis)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _date(value):
    if value is not None:
        date.fromisoformat(value)


def validate_course(course: dict, analysis: dict) -> None:
    if course.get("schema_version") != "2.0" or course.get("course_key") != analysis["course_key"]:
        raise ValueError("個人課程識別不符")
    if course.get("source") != {"analysis_id": analysis["analysis_id"], "sources": analysis["sources"]}:
        raise ValueError("分析來源不可修改")
    for name in ("start_date", "end_date"):
        _date(course[name])
    if course["start_date"] and course["end_date"] and course["start_date"] > course["end_date"]:
        raise ValueError("結束日早於開始日")
    for session in course["course"]["sessions"]:
        if session["weekday"] not in range(1, 8) or not re.fullmatch(r"\d\d:\d\d", session["start_time"]) or not re.fullmatch(r"\d\d:\d\d", session["end_time"]):
            raise ValueError("上課時段格式錯誤")
        start = datetime.strptime(session["start_time"], "%H:%M")
        end = datetime.strptime(session["end_time"], "%H:%M")
        if start >= end:
            raise ValueError("上課時段結束時間須晚於開始時間")
    ids = {c["id"] for c in course["course"]["textbook"]["chapters"]}
    for group in (course["grading"], course["assessments"]):
        for item in group:
            weight = item["weight"]
            value = weight["value"]
            if value is not None and (not isinstance(value, (int, float)) or not 0 <= value <= 100):
                raise ValueError("評分比例須在 0–100 之間")
    weights = [x["weight"]["value"] for x in course["grading"]]
    if weights and all(v is not None for v in weights) and abs(sum(weights) - 100) > .01:
        raise ValueError("評分比例總和須為 100")
    for item in course["assessments"]:
        _date(item["date"]["value"])
        if not set(item["scope"]["value"]) <= ids:
            raise ValueError("評量引用不存在的章節")
    weeks = course["weekly_schedule"]
    if len({item["week"] for item in weeks}) != len(weeks):
        raise ValueError("週次重複")
    for item in weeks:
        if item["week"] < 1 or not set(item["chapters"]) <= ids:
            raise ValueError("週次或章節引用錯誤")
        if len(item["date_range"]) not in (0, 2) or (len(item["date_range"]) == 2 and (not all(item["date_range"]) or item["date_range"][0] > item["date_range"][1])):
            raise ValueError("每週日期須同時填寫開始與結束，且結束不得早於開始")
        for day in item["date_range"]:
            _date(day)


def save_course(course: dict, analysis: dict) -> Path:
    user_id = course.get("user_id", "")
    previous = read_course(user_id, analysis)
    baseline = previous or draft_course(analysis, user_id)
    allowed = {"start_date", "end_date", "course", "grading", "assessments", "weekly_schedule"}
    immutable = set(baseline) - allowed - {"updated_at", "created_at"}
    if set(course) != set(baseline) or any(course[k] != baseline[k] for k in immutable):
        raise ValueError("不可修改識別、來源或建立時間")
    if previous:
        course["created_at"] = previous["created_at"]
    validate_course(course, analysis)
    for old, new in zip(baseline["grading"], course["grading"]):
        if old["weight"]["value"] != new["weight"]["value"]:
            new["weight"].update(status="user_supplied", evidence="使用者覆核修改")
    for old, new in zip(baseline["assessments"], course["assessments"]):
        for name in ("weight", "date", "scope"):
            if old[name]["value"] != new[name]["value"]:
                new[name].update(status="user_supplied", evidence="使用者覆核修改")
    for old, new in zip(baseline["weekly_schedule"], course["weekly_schedule"]):
        if any(old[k] != new[k] for k in ("topics", "chapters", "date_range")):
            new["status"] = "user_supplied"
    course["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    path = course_path(user_id, analysis)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(course, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
