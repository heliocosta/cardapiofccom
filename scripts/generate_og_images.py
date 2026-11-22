#!/usr/bin/env python3
"""
scripts/generate_og_images.py
Generates 1200x630 OpenGraph images for matches, teams, and leagues.
Design requirement: Just the logos, NO text at all.
"""

import os
import re
import sys
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_OG_DIR = os.path.join(BASE_DIR, "static", "og")
CACHE_DIR = os.path.join(BASE_DIR, ".tmp", "og-cache")

MATCHES_OG_DIR = os.path.join(STATIC_OG_DIR, "matches")
TEAMS_OG_DIR = os.path.join(STATIC_OG_DIR, "teams")
LEAGUES_OG_DIR = os.path.join(STATIC_OG_DIR, "leagues")

BG_COLOR = (15, 32, 0)  # #0F2000 CardápioFC signature dark background
CANVAS_SIZE = (1200, 630)

os.makedirs(MATCHES_OG_DIR, exist_ok=True)
os.makedirs(TEAMS_OG_DIR, exist_ok=True)
os.makedirs(LEAGUES_OG_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
}

def get_cached_image(url):
    """Download image if not cached, open and return RGBA Image object."""
    if not url or not url.startswith("http"):
        return None
    url_hash = urllib.parse.quote_plus(url)[-80:]
    ext = ".png"
    cache_path = os.path.join(CACHE_DIR, f"{url_hash}{ext}")

    if not os.path.exists(cache_path):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read()
            with open(cache_path, "wb") as f:
                f.write(data)
        except Exception:
            return None

    try:
        img = Image.open(cache_path).convert("RGBA")
        return img
    except Exception:
        return None

def fit_image(img, max_w, max_h):
    """Proportionally fit image inside max_w x max_h bounds."""
    w, h = img.size
    ratio = min(max_w / float(w), max_h / float(h))
    new_w = max(1, int(w * ratio))
    new_h = max(1, int(h * ratio))
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)

def generate_league_og(slug, logo_url):
    out_path = os.path.join(LEAGUES_OG_DIR, f"{slug}.png")
    if os.path.exists(out_path):
        return
    img = get_cached_image(logo_url)
    canvas = Image.new("RGBA", CANVAS_SIZE, color=BG_COLOR)
    if img:
        fitted = fit_image(img, 360, 360)
        fw, fh = fitted.size
        x = (1200 - fw) // 2
        y = (630 - fh) // 2
        canvas.paste(fitted, (x, y), fitted)
    canvas.convert("RGB").save(out_path, "PNG", optimize=True)

def generate_team_og(slug, crest_url):
    out_path = os.path.join(TEAMS_OG_DIR, f"{slug}.png")
    if os.path.exists(out_path):
        return
    img = get_cached_image(crest_url)
    canvas = Image.new("RGBA", CANVAS_SIZE, color=BG_COLOR)
    if img:
        fitted = fit_image(img, 360, 360)
        fw, fh = fitted.size
        x = (1200 - fw) // 2
        y = (630 - fh) // 2
        canvas.paste(fitted, (x, y), fitted)
    canvas.convert("RGB").save(out_path, "PNG", optimize=True)

def generate_match_og(slug, home_crest_url, away_crest_url):
    out_path = os.path.join(MATCHES_OG_DIR, f"{slug}.png")
    if os.path.exists(out_path):
        return
    home_img = get_cached_image(home_crest_url)
    away_img = get_cached_image(away_crest_url)
    canvas = Image.new("RGBA", CANVAS_SIZE, color=BG_COLOR)

    # Home crest on left (center at x=360, y=315)
    if home_img:
        h_fit = fit_image(home_img, 280, 280)
        hw, hh = h_fit.size
        hx = 360 - (hw // 2)
        hy = 315 - (hh // 2)
        canvas.paste(h_fit, (hx, hy), h_fit)

    # Away crest on right (center at x=840, y=315)
    if away_img:
        a_fit = fit_image(away_img, 280, 280)
        aw, ah = a_fit.size
        ax = 840 - (aw // 2)
        ay = 315 - (ah // 2)
        canvas.paste(a_fit, (ax, ay), a_fit)

    canvas.convert("RGB").save(out_path, "PNG", optimize=True)

def _read_settings_yaml():
    settings_path = os.path.join(BASE_DIR, "data", "cfc", "settings.yaml")
    if not os.path.exists(settings_path):
        return {}
    values = {}
    with open(settings_path, "r", encoding="utf-8") as f:
        for line in f:
            m = re.match(
                r'^(webhookURL|webhookKey):\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s#]+))',
                line.rstrip("\r\n"),
            )
            if not m:
                continue
            val = next((g for g in (m.group(2), m.group(3), m.group(4)) if g is not None), "")
            values[m.group(1)] = val
    return values


def resolve_webhook_config():
    """Return (webhook_url, webhook_key) from env vars, falling back to data/cfc/settings.yaml."""
    env_url = os.environ.get("CFC_WEBHOOK_URL", "").strip()
    env_key = os.environ.get("HUGO_CFC_WEBHOOK_KEY", "").strip()
    if env_url and env_key:
        return env_url, env_key
    settings = _read_settings_yaml()
    return (
        env_url or settings.get("webhookURL", ""),
        env_key or settings.get("webhookKey", ""),
    )


def main():
    payload_path = os.environ.get("CFC_PAYLOAD_PATH", "/tmp/retool_payload.json")
    data = None
    if os.path.exists(payload_path):
        with open(payload_path, "r") as f:
            data = json.load(f)
    else:
        print("Dataset payload not found locally, fetching from Retool webhook...")
        webhook_url, webhook_key = resolve_webhook_config()
        if not webhook_url or not webhook_key:
            print("CFC_WEBHOOK_URL / HUGO_CFC_WEBHOOK_KEY not set and payload missing; skipping remote fetch.")
            return
        req = urllib.request.Request(
            webhook_url,
            data=b"{}",
            headers={
                "Content-Type": "application/json",
                "X-Workflow-Api-Key": webhook_key,
                "User-Agent": "CardapioFC-OG-Generator/1.0"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"Error fetching from webhook: {e}")
            return

    if not data:
        print("No dataset data available.")
        return

    leagues = data.get("leagues", {}).get("leagues", {})
    teams = data.get("teams", {}).get("teams", {})
    matches = data.get("matches", {}).get("matches", {})

    print(f"Generating OG images for {len(leagues)} leagues, {len(teams)} teams, {len(matches)} matches...")

    # Leagues
    with ThreadPoolExecutor(max_workers=10) as executor:
        for slug, l in leagues.items():
            logo = l.get("logo")
            if logo:
                executor.submit(generate_league_og, slug, logo)

    # Teams
    with ThreadPoolExecutor(max_workers=10) as executor:
        for slug, t in teams.items():
            crest = t.get("crest")
            if crest:
                executor.submit(generate_team_og, slug, crest)

    # Matches
    with ThreadPoolExecutor(max_workers=10) as executor:
        for slug, m in matches.items():
            home_slug = m.get("homeSlug")
            away_slug = m.get("awaySlug")
            home_t = teams.get(home_slug, {})
            away_t = teams.get(away_slug, {})
            home_crest = home_t.get("crest")
            away_crest = away_t.get("crest")
            executor.submit(generate_match_og, slug, home_crest, away_crest)

    print("OG image generation finished.")

if __name__ == "__main__":
    main()
