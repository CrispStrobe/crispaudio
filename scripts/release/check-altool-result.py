#!/usr/bin/env python3
"""Require an affirmative JSON result: altool can exit zero after a failed upload."""
import argparse
import json
import pathlib
import sys


def check(result):
    if result.get('product-errors'):
        raise ValueError('Apple rejected the upload: ' + json.dumps(result['product-errors'], ensure_ascii=False))
    message = result.get('success-message')
    if not isinstance(message, str) or not message.strip():
        raise ValueError('Apple did not return an affirmative upload result; inspect the upload log.')
    return message


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('result', type=pathlib.Path)
    args = parser.parse_args()
    try:
        print(check(json.loads(args.result.read_text())))
    except (ValueError, OSError, TypeError) as error:
        print(f'Apple upload failed: {error}', file=sys.stderr)
        sys.exit(1)
