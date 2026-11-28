import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import personal_course as pc
import extract
from test_weekly_schedule import FIELDS, URL, model_result


class PersonalCourseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.output_patch = patch.object(pc, "OUTPUT_DIR", Path(cls.tmp.name))
        cls.output_patch.start()
        cls.analysis = extract.build_result("1151", "52016", extract.DEFAULT_MODEL, FIELDS, {"session": "Mon234/E6-A204"}, URL, URL, model_result())
        (Path(cls.tmp.name) / extract.analysis_filename(cls.analysis["course_key"])).write_text(
            __import__("json").dumps(cls.analysis, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.output_patch.stop()
        cls.tmp.cleanup()

    def test_search_keeps_section_serials_separate(self):
        html = "<table><tr><td>52015<br>CE3007-A</td><td>Computer Network</td><td>A</td><td>3</td><td>Mon123/R1</td></tr><tr><td>52016<br>CE3007-B</td><td>Computer Network</td><td>B</td><td>3</td><td>Mon234/R2</td></tr></table>"
        with patch.object(pc, "fetch", return_value=html):
            rows = pc.search_courses("1151", "Computer Network")
        self.assertEqual([r["serial_no"] for r in rows], ["52015", "52016"])

    def test_existing_analysis_does_not_extract(self):
        with patch("extract.extract") as generate:
            self.assertEqual(pc.analysis_for("1151", "52016")["analysis_id"], self.analysis["analysis_id"])
            generate.assert_not_called()

    def test_filename_matches_analysis(self):
        path = pc.course_path("user001", self.analysis)
        self.assertEqual(path.name, "115-1_CE3007-B.json")
        self.assertEqual(extract.analysis_filename("115-1_IM6055-*"), "115-1_IM6055-%2A.json")

    def test_old_analysis_filename_is_ignored(self):
        new_path = Path(self.tmp.name) / extract.analysis_filename(self.analysis["course_key"])
        old_path = Path(self.tmp.name) / "1151_52016.json"
        old_path.write_bytes(new_path.read_bytes())
        new_path.rename(new_path.with_suffix(".backup"))
        try:
            self.assertIsNone(pc.analysis_path("1151", "52016"))
        finally:
            new_path.with_suffix(".backup").rename(new_path)
            old_path.unlink()

    def test_missing_analysis_failure_creates_no_course(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(pc, "OUTPUT_DIR", Path(tmp)), patch("extract.extract", side_effect=RuntimeError("failed")):
            with self.assertRaises(RuntimeError):
                pc.analysis_for("1151", "99999")
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_save_reload_and_validation(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(pc, "COURSES_DIR", Path(tmp)):
            course = pc.draft_course(self.analysis)
            course["weekly_schedule"][0]["topics"] = ["我修改的主題"]
            path = pc.save_course(course, self.analysis)
            stored = pc.read_course(pc.USER_ID, self.analysis)
            self.assertEqual(stored["weekly_schedule"][0]["status"], "user_supplied")
            self.assertEqual(stored["weekly_schedule"][1]["status"], "estimated")
            self.assertEqual(path, pc.course_path(pc.USER_ID, self.analysis))
            for mutate in (lambda c: c["course"]["sessions"][0].update(end_time="08:00"),
                           lambda c: c["weekly_schedule"][0].update(chapters=["missing"]),
                           lambda c: c.update(start_date="2026-99-99")):
                bad = copy.deepcopy(stored)
                mutate(bad)
                with self.assertRaises(ValueError):
                    pc.save_course(bad, self.analysis)
            self.assertEqual(pc.read_course(pc.USER_ID, self.analysis), stored)
            other = pc.draft_course(self.analysis, "other_user")
            pc.save_course(other, self.analysis)
            self.assertNotEqual(pc.course_path("other_user", self.analysis), path)
            self.assertEqual(pc.read_course(pc.USER_ID, self.analysis), stored)


if __name__ == "__main__":
    unittest.main()
