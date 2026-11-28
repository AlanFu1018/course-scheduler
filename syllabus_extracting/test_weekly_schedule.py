"""Offline checks for weekly estimates and regeneration behavior."""

import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import extract


FIELDS = {"課號": "CE3007-B", "授課週數": "16", "授課內容": "網路概論、應用層、傳輸層"}
URL = "https://cis.ncu.edu.tw/Course/main/query/byKeywords?serialNo=52016&outline=52016&semester=1151"


def model_result(count=16, confirmed=()):
    return {
        "textbook": {"title": None, "authors": [], "edition": None, "chapters": []},
        "grading": [], "assessments": [],
        "weekly_schedule": [
            {"week": n, "date_range": [], "topics": ["網路概論"], "chapters": [],
             "status": "confirmed" if n in confirmed else "estimated"}
            for n in range(1, count + 1)
        ],
    }


def build(fields, data):
    return extract.build_result("1151", "52016", extract.DEFAULT_MODEL, fields, {}, URL, URL, data)


class WeeklyScheduleTests(unittest.TestCase):
    def test_sixteen_estimated_weeks_without_dates_or_chapters(self):
        rows = build(FIELDS, model_result())["weekly_schedule"]
        self.assertEqual([row["week"] for row in rows], list(range(1, 17)))
        self.assertTrue(all(row["status"] == "estimated" and row["date_range"] == []
                            and row["chapters"] == [] for row in rows))

    def test_partial_and_complete_explicit_schedule(self):
        partial = {**FIELDS, "授課進度": "第 2 週：應用層；第 5 週：傳輸層"}
        build(partial, model_result(16, {2, 5}))
        with self.assertRaisesRegex(ValueError, "應標為 confirmed"):
            build(partial, model_result())
        complete = {**FIELDS, "授課進度": "；".join(f"第 {n} 週：主題" for n in range(1, 17))}
        build(complete, model_result(16, set(range(1, 17))))

    def test_missing_teaching_weeks_never_invents_total(self):
        fields = {"授課進度": "第 2 週：網路概論"}
        build(fields, {**model_result(0), "weekly_schedule": [
            {"week": 2, "date_range": [], "topics": ["網路概論"], "chapters": [], "status": "confirmed"}]})
        with self.assertRaisesRegex(ValueError, "不可推估"):
            build(fields, model_result())

    def test_bad_week_list_and_invented_chapter(self):
        for change in (lambda rows: rows.pop(),
                       lambda rows: rows[1].update(week=1),
                       lambda rows: rows[0].update(status="confirmed"),
                       lambda rows: rows[0].update(chapters=["Ch1"]),
                       lambda rows: rows[0].update(date_range=["2026-09-01"])):
            with self.subTest(change=change):
                data = copy.deepcopy(model_result())
                change(data["weekly_schedule"])
                with self.assertRaises(ValueError):
                    build(FIELDS, data)

    def test_four_invalid_generations_do_not_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "1151_52016.json"
            target.write_text("original", encoding="utf-8")
            invalid = model_result(15)
            with patch.object(extract, "OUTPUT_DIR", Path(directory)), \
                 patch.object(extract, "source_data", return_value=(FIELDS, {}, URL, URL)), \
                 patch.object(extract, "call_groq", return_value=invalid) as generate:
                with self.assertRaisesRegex(RuntimeError, "4 次生成"):
                    extract.extract("1151", "52016", "test-key")
            self.assertEqual(generate.call_count, 4)
            self.assertEqual(target.read_text(encoding="utf-8"), "original")


if __name__ == "__main__":
    unittest.main()
