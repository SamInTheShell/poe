#!/usr/bin/env python3
"""
name.py

Generate every permutation of a set of characters (letters A-Za-z only).
Non-letter characters are discarded.

Usage:
  python name.py "C A T"
  echo "C A T" | python name.py
"""
from __future__ import annotations

import argparse
import itertools
import math
import re
import sys
from collections import Counter

LETTER_RE = re.compile(r"[^A-Za-z]")


def clean_input(raw: str) -> str:
    """Remove everything except A-Za-z from the input string."""
    return LETTER_RE.sub("", raw)


def distinct_permutations(s: str):
    """Yield distinct permutations of s (handles repeated letters without duplicating outputs)."""
    seen = set()
    for tup in itertools.permutations(s):
        perm = "".join(tup)
        if perm in seen:
            continue
        seen.add(perm)
        yield perm


def all_permutations(s: str):
    """Yield all permutations including duplicates."""
    for tup in itertools.permutations(s):
        yield "".join(tup)


def unique_count(s: str) -> int:
    """Count of distinct permutations given repeated characters = n! / (prod(freq!))."""
    n = len(s)
    freq = Counter(s)
    denom = 1
    for v in freq.values():
        denom *= math.factorial(v)
    return math.factorial(n) // denom


def parse_args():
    p = argparse.ArgumentParser(
        description="Print permutations of a cleaned letters-only input."
    )
    p.add_argument(
        "input",
        nargs="?",
        help="String of characters (non-letters will be discarded). If omitted stdin is read.",
    )
    p.add_argument(
        "-a",
        "--allow-duplicates",
        action="store_true",
        help="Do not deduplicate permutations when the input has repeated letters.",
    )
    p.add_argument(
        "-m",
        "--max",
        type=int,
        default=0,
        help="Stop after printing N permutations (0 means no limit).",
    )
    return p.parse_args()


def main():
    args = parse_args()

    if args.input:
        raw = args.input
    else:
        raw = sys.stdin.read()

    cleaned = clean_input(raw)
    if not cleaned:
        print(
            "No letters A-Za-z found in input (after cleaning). Nothing to permute.",
            file=sys.stderr,
        )
        sys.exit(1)

    n = len(cleaned)
    if n > 9 and not args.max:
        print(
            f"Warning: {n} letters -> up to {math.factorial(n)} permutations (this can be huge).",
            file=sys.stderr,
        )

    if args.allow_duplicates:
        iterator = all_permutations(cleaned)
        total_possible = math.factorial(n)
    else:
        iterator = distinct_permutations(cleaned)
        total_possible = unique_count(cleaned)

    print(f"Input after cleaning: '{cleaned}' (length {n})", file=sys.stderr)
    print(f"Distinct permutations to generate: {total_possible}", file=sys.stderr)
    if args.max:
        print(f"Max output limit: {args.max}", file=sys.stderr)

    printed = 0
    try:
        for perm in iterator:
            print(perm)
            printed += 1
            if args.max and printed >= args.max:
                break
    except BrokenPipeError:
        # Allow piping into head or similar
        pass


if __name__ == "__main__":
    main()
