import json
import math
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\suraj\Downloads\LS_Karnataka_Report (1).xlsx")
OUTPUT = ROOT / "data" / "db.json"


def now_iso():
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def district_name(sheet):
    return sheet.replace("_", " ")


def parse_batch(text):
    match = re.search(r"Batch Year:\s*(\d{4})", text or "")
    return int(match.group(1)) if match else ""


def main():
    if not SOURCE.exists():
        raise SystemExit(f"Source workbook not found: {SOURCE}")

    xls = pd.ExcelFile(SOURCE)
    members = []
    districts = [sheet for sheet in xls.sheet_names if sheet != "Karnataka Summary"]

    for sheet in districts:
        raw = pd.read_excel(SOURCE, sheet_name=sheet, header=None, dtype=object)
        district = district_name(sheet)
        batch_year = ""
        data_started = False

        for _, row in raw.iterrows():
            first = clean(row.iloc[0] if len(row) > 0 else "")
            if not first:
                continue
            if "Batch Year:" in first:
                batch_year = parse_batch(first)
                data_started = True
                continue
            if first == "#" or first == "Total":
                continue
            if not data_started:
                continue
            if not first.isdigit():
                continue

            member = {
                "id": str(uuid.uuid4()),
                "sourceRow": int(first),
                "district": district,
                "name": clean(row.iloc[1] if len(row) > 1 else ""),
                "lsNumber": clean(row.iloc[2] if len(row) > 2 else ""),
                "loginId": clean(row.iloc[3] if len(row) > 3 else ""),
                "taluk": clean(row.iloc[4] if len(row) > 4 else ""),
                "gender": clean(row.iloc[5] if len(row) > 5 else ""),
                "dateOfBirth": clean(row.iloc[6] if len(row) > 6 else ""),
                "age": int(float(clean(row.iloc[7]))) if clean(row.iloc[7] if len(row) > 7 else "").isdigit() else "",
                "phoneNumber": clean(row.iloc[8] if len(row) > 8 else ""),
                "qualification": clean(row.iloc[9] if len(row) > 9 else ""),
                "batchYear": batch_year,
                "status": "Active",
                "remarks": "",
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            }
            members.append(member)

    taluks = sorted({member["taluk"] for member in members if member["taluk"]})
    users = [
        {
            "id": "admin",
            "username": "admin",
            "password": "admin",
            "name": "State Admin",
            "role": "admin",
            "district": "",
            "taluk": "",
            "active": True,
            "createdAt": now_iso(),
        }
    ]

    db = {
        "meta": {
            "sourceFile": str(SOURCE),
            "importedAt": now_iso(),
            "updatedAt": now_iso(),
            "memberCount": len(members),
            "districtCount": len(districts),
            "talukCount": len(taluks),
        },
        "users": users,
        "members": members,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(db, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Imported {len(members)} members, {len(districts)} districts, {len(taluks)} taluks into {OUTPUT}")


if __name__ == "__main__":
    main()
