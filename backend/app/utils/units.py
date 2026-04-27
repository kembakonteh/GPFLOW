KG_TO_LB: float = 2.20462


def lbs_to_kg(lbs: float) -> float:
    """Convert pounds to kilograms, rounded to 3 decimal places."""
    return round(lbs / KG_TO_LB, 3)


def kg_to_lbs(kg: float) -> float:
    """Convert kilograms to pounds, rounded to 3 decimal places."""
    return round(kg * KG_TO_LB, 3)


def format_weight(kg: float, unit: str) -> str:
    """
    Return a human-readable weight string.

    Args:
        kg:   Weight value stored in kilograms.
        unit: Display unit — "kg" or "lbs".

    Examples:
        format_weight(10.0, "kg")  → "10.0 kg"
        format_weight(10.0, "lbs") → "22.046 lbs"
    """
    if unit == "lbs":
        return f"{kg_to_lbs(kg)} lbs"
    return f"{round(kg, 3)} kg"
