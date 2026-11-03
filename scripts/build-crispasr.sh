#!/usr/bin/env bash
# Build a relocatable libcrispasr for the macOS app bundle.
#
# CrispAudio passes PCM to CrispASR and decodes files with its own stack (Glint/
# Apple), so the library is built WITHOUT opus/ogg/ffmpeg/curl: no codec or
# download code ships in it. The pinned revision is scripts/crispasr-revision.txt.
#
# Output: src-tauri/generated/crispasr/ with libcrispasr.dylib + ggml dylibs whose
# install names are @rpath/... and whose only rpath is @loader_path, a
# manifest.json, and tauri.conf.json (a --config overlay listing the frameworks).
#
# Environment:
#   CRISPASR_WORK   build/cache folder (default ~/.cache/crispaudio-crispasr)
#   CRISPASR_REPO   git URL or local checkout to clone from (default GitHub)
#   ARCH            arm64 (default) or x86_64
#   JOBS            parallel build jobs (default 2)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
read -r TAG COMMIT < "$ROOT/scripts/crispasr-revision.txt"
WORK="${CRISPASR_WORK:-$HOME/.cache/crispaudio-crispasr}"
REPO="${CRISPASR_REPO:-https://github.com/CrispStrobe/CrispASR}"
ARCH="${ARCH:-arm64}"
JOBS="${JOBS:-2}"
SRC="$WORK/src-$COMMIT"
BUILD="$WORK/build-$COMMIT-$ARCH"
OUT="$ROOT/src-tauri/generated/crispasr"

[[ "$(uname)" == Darwin ]] || { echo "error: macOS only (bundling uses install_name_tool)" >&2; exit 2; }
mkdir -p "$WORK"

if [[ ! -d "$SRC/.git" ]]; then
  echo "==> clone CrispASR $TAG"
  rm -rf "$SRC.partial"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$TAG" "$REPO" "$SRC.partial"
  git -C "$SRC.partial" submodule update --quiet --init --recursive --depth 1
  mv "$SRC.partial" "$SRC"
fi
HEAD="$(git -C "$SRC" rev-parse HEAD)"
[[ "$HEAD" == "$COMMIT" ]] || { echo "error: $TAG resolved to $HEAD, expected $COMMIT" >&2; exit 3; }

echo "==> configure ($ARCH, opus/ffmpeg/curl/CoreML off)"
cmake -S "$SRC" -B "$BUILD" -Wno-dev \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
  -DCMAKE_OSX_ARCHITECTURES="$ARCH" \
  -DBUILD_SHARED_LIBS=ON \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_NATIVE=OFF \
  -DCRISPASR_PORTABLE_CPU=ON \
  -DCRISPASR_OPUS=OFF \
  -DCRISPASR_FFMPEG=OFF \
  -DCRISPASR_CURL=OFF \
  -DCRISPASR_SDL2=OFF \
  -DCRISPASR_COREML=OFF \
  -DCRISPASR_BUILD_TESTS=OFF \
  -DCRISPASR_BUILD_EXAMPLES=OFF \
  -DCRISPASR_BUILD_SERVER=OFF >/dev/null

echo "==> build ($JOBS jobs)"
# Every backend archive first, then the shared library that links them.
cmake --build "$BUILD" -j "$JOBS" >/dev/null
cmake --build "$BUILD" -j "$JOBS" --target crispasr-lib >/dev/null

LIB="$(find "$BUILD/src" -maxdepth 1 -type f -name 'libcrispasr.*.dylib' | sort -V | tail -1)"
[[ -n "$LIB" ]] || { echo "error: libcrispasr dylib not produced" >&2; exit 4; }

echo "==> stage $OUT"
rm -rf "$OUT.partial" && mkdir -p "$OUT.partial"
cp -L "$LIB" "$OUT.partial/libcrispasr.dylib"
# Copy every @rpath dependency (transitively), resolving it in the build tree.
queue=("libcrispasr.dylib")
while ((${#queue[@]})); do
  current="${queue[0]}"; queue=("${queue[@]:1}")
  # otool -L also prints the file's own install name; skip it.
  self_id="$(otool -D "$OUT.partial/$current" | tail -1)"
  while read -r dep; do
    base="$(basename "$dep")"
    [[ -f "$OUT.partial/$base" ]] && continue
    found="$(find "$BUILD" -name "$base" \( -type f -o -type l \) | head -1)"
    [[ -n "$found" ]] || { echo "error: dependency $base of $current not found" >&2; exit 5; }
    cp -L "$found" "$OUT.partial/$base"
    queue+=("$base")
  done < <(otool -L "$OUT.partial/$current" | awk 'NR>1 {print $1}' | grep '^@rpath/' | grep -vxF "$self_id" || true)
done

for file in "$OUT.partial"/*.dylib; do
  base="$(basename "$file")"
  chmod u+w "$file"
  install_name_tool -id "@rpath/$base" "$file" 2>/dev/null
  # libcrispasr links its versioned self-name; map it to the bundled file name.
  while read -r dep; do
    case "$dep" in
      @rpath/libcrispasr*.dylib) install_name_tool -change "$dep" "@rpath/libcrispasr.dylib" "$file" 2>/dev/null ;;
    esac
  done < <(otool -L "$file" | awk 'NR>1 {print $1}')
  for rpath in $(otool -l "$file" | awk '/cmd LC_RPATH/ {getline; getline; print $2}'); do
    install_name_tool -delete_rpath "$rpath" "$file" 2>/dev/null
  done
  install_name_tool -add_rpath "@loader_path" "$file" 2>/dev/null
  codesign --force --sign - "$file" >/dev/null 2>&1
done

echo "==> verify"
status=0
for file in "$OUT.partial"/*.dylib; do
  while read -r dep; do
    case "$dep" in
      /usr/lib/*|/System/*) ;;
      @rpath/*) [[ -f "$OUT.partial/${dep#@rpath/}" ]] || { echo "missing $dep for $(basename "$file")"; status=1; } ;;
      *) echo "non-relocatable $dep in $(basename "$file")"; status=1 ;;
    esac
  done < <(otool -L "$file" | awk 'NR>1 {print $1}')
  rpaths="$(otool -l "$file" | awk '/cmd LC_RPATH/ {getline; getline; print $2}' | tr '\n' ' ')"
  [[ "$rpaths" == "@loader_path " ]] || { echo "unexpected rpaths in $(basename "$file"): $rpaths"; status=1; }
  if otool -L "$file" | grep -qiE 'opus|ogg|avcodec|curl'; then echo "codec/network library linked in $(basename "$file")"; status=1; fi
done
symbols="$(nm -gU "$OUT.partial/libcrispasr.dylib")"
for symbol in crispasr_session_open crispasr_session_separate crispasr_session_separate_stem_name \
  crispasr_session_speech_to_speech crispasr_session_beats_events crispasr_vad_segments; do
  grep -q " _$symbol$" <<<"$symbols" || { echo "missing symbol $symbol"; status=1; }
done
((status == 0)) || { echo "error: staged library failed verification" >&2; exit 6; }

python3 - "$OUT.partial" "$TAG" "$COMMIT" "$ARCH" <<'PY'
import hashlib, json, os, sys
out, tag, commit, arch = sys.argv[1:]
files = sorted(f for f in os.listdir(out) if f.endswith(".dylib"))
json.dump({"tag": tag, "commit": commit, "arch": arch,
           "options": "Release, Metal embedded, portable CPU, opus/ffmpeg/curl/CoreML off",
           "files": {f: hashlib.sha256(open(os.path.join(out, f), "rb").read()).hexdigest() for f in files}},
          open(os.path.join(out, "manifest.json"), "w"), indent=2)
json.dump({"bundle": {"macOS": {"frameworks": [f"generated/crispasr/{f}" for f in files]}}},
          open(os.path.join(out, "tauri.conf.json"), "w"), indent=2)
PY
rm -rf "$OUT" && mv "$OUT.partial" "$OUT"
echo "==> done: $(ls "$OUT" | tr '\n' ' ')"
