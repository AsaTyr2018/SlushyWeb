"""Build the compact SlushyWeb country matrix from CEPII BACI HS22 data."""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path


HS_CODES = {
    "agave": ("170290",), "apple": ("080810",), "avocado": ("080440",),
    "banana": ("080390",), "blueberry": ("081040",), "caramel": ("170290",),
    "chili": ("070960",), "chocolate": ("1806",), "cinnamon": ("0906",),
    "cocoa": ("180100", "180500"), "coconut": ("080111", "080112", "080119"),
    "coffee": ("0901",), "dairy": ("0401", "0402", "0403", "0405"),
    "date": ("080410",), "dragonfruit": ("081090",), "durian": ("081060",),
    "ginger": ("091011", "091012"), "grape": ("080610",),
    "hazelnut": ("080221", "080222"), "hibiscus": ("121190",),
    "jackfruit": ("081090",), "kweni_mango": ("080450",), "lemon": ("080550",),
    "lemongrass": ("121190",), "lime": ("080550",), "mango": ("080450",),
    "mint": ("121190",), "oat": ("1004",), "orange": ("080510", "080521", "080522", "080529"),
    "palm_sugar": ("170290",), "pandan": ("121190",), "passionfruit": ("081090",),
    "pineapple": ("080430",), "rambutan": ("081090",), "raspberry": ("081020",),
    "rhubarb": ("070999",), "salak": ("081090",), "soursop": ("081090",),
    "speculoos": ("190531", "190590"), "star_anise": ("090961", "090962"),
    "strawberry": ("081010",), "tamarind": ("081090",),
    "vanilla": ("090510", "090520"), "watermelon": ("080711",),
    "white_chocolate": ("1806",),
}

SPECIALTY_DEFAULTS = {"amaretto_syrup", "blue_curacao_syrup", "elderflower"}
LOW_SPECIFICITY = {"dragonfruit", "hibiscus", "jackfruit", "lemongrass", "mint", "pandan", "passionfruit", "rambutan", "rhubarb", "salak", "soursop", "tamarind"}


def matches(code, patterns):
    return any(code.startswith(pattern) for pattern in patterns)


def classify(value_usd, quantity_kg, population):
    if population <= 0:
        return "unknown"
    kg_pc = quantity_kg / population
    usd_pc = value_usd / population
    if kg_pc >= 0.02 or usd_pc >= 0.15:
        return "import_common"
    if kg_pc >= 0.002 or usd_pc >= 0.02:
        return "specialty"
    if value_usd > 0 or quantity_kg > 0:
        return "rare_expensive"
    return "unavailable"


def main(baci_dir, population_file, database_file):
    baci_dir = Path(baci_dir)
    database_file = Path(database_file)
    database = json.loads(database_file.read_text(encoding="utf-8"))
    curated = {key: database["countries"][key] for key in ("DE", "ID")}

    populations_raw = json.loads(Path(population_file).read_text(encoding="utf-8"))[1]
    populations = {row["countryiso3code"]: row["value"] for row in populations_raw if row.get("value")}

    countries = {}
    with (baci_dir / "country_codes_V202601.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            iso2, iso3 = row["country_iso2"], row["country_iso3"]
            population = populations.get(iso3, 0)
            if len(iso2) == 2 and population and population >= 500_000:
                countries[int(row["country_code"])] = (iso2, iso3, row["country_name"], population)

    flow = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0, 0.0]))
    csv.field_size_limit(min(sys.maxsize, 2_147_483_647))
    with (baci_dir / "BACI_HS22_Y2024_V202601.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            code = row["k"]
            relevant = [key for key, patterns in HS_CODES.items() if matches(code, patterns)]
            if not relevant:
                continue
            exporter, importer = int(row["i"]), int(row["j"])
            value_usd = float(row["v"] or 0) * 1000
            quantity_kg = 0 if row["q"] == "NA" else float(row["q"] or 0) * 1000
            for key in relevant:
                if importer in countries:
                    flow[importer][key][0] += value_usd
                    flow[importer][key][1] += quantity_kg
                if exporter in countries:
                    flow[exporter][key][2] += value_usd
                    flow[exporter][key][3] += quantity_kg

    generated = {}
    all_ingredients = set(database["ingredients"])
    for code, (iso2, iso3, name, population) in countries.items():
        buckets = {status: [] for status in ("local_common", "import_common", "specialty", "rare_expensive", "unavailable", "restricted", "prohibited")}
        for ingredient in sorted(all_ingredients):
            if ingredient in SPECIALTY_DEFAULTS:
                status = "specialty"
            elif ingredient not in HS_CODES:
                status = "unknown"
            else:
                imports_usd, imports_kg, exports_usd, exports_kg = flow[code][ingredient]
                export_status = classify(exports_usd, exports_kg, population)
                import_status = classify(imports_usd, imports_kg, population)
                status = "local_common" if export_status == "import_common" else import_status
            if status == "unknown":
                buckets["unavailable"].append(ingredient)
            else:
                buckets[status].append(ingredient)
        generated[iso2] = {
            "name": {"de": name, "en": name},
            "iso3": iso3,
            "population": population,
            "assessment": "baci_estimate",
            "legalReview": "pending",
            "confidence": "low" if any(key in LOW_SPECIFICITY for key in all_ingredients) else "medium",
            **buckets,
        }

    generated.update(curated)
    database["countries"] = dict(sorted(generated.items()))
    database["version"] = 2
    database["tradeData"] = {
        "source": "CEPII BACI HS22 V202601",
        "year": 2024,
        "license": "Etalab Open Licence 2.0",
        "method": "Per-capita import and export thresholds; HS basket matches are estimates; legal review is separate.",
    }
    database_file.write_text(json.dumps(database, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(generated)} countries to {database_file}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: build_global_availability.py BACI_DIR POPULATION_JSON DATABASE_JSON")
    main(*sys.argv[1:])
