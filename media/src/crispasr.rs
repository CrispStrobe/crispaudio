//! In-process CrispASR audio tasks through its C ABI, loaded at runtime like
//! the Dart/Flutter wrapper. Only audio processing lives here: stem separation,
//! speech regeneration, voice-activity regions and beat tracking. ASR/TTS
//! creation stays with CrisperWeaver. The library and model files are never
//! bundled or downloaded by CrispAudio, and nothing runs in a subprocess.
//!
//! Work is chunked where the model allows it so cooperative job cancellation
//! is honoured between chunks; a single native call itself cannot be interrupted.
use crate::Result;
use serde::Serialize;
use std::{
    ffi::{c_char, c_int, c_void, CStr, CString},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

/// Planar PCM at an explicit sample rate.
#[derive(Clone, Debug, PartialEq)]
pub struct Audio {
    pub rate: u32,
    pub channels: Vec<Vec<f32>>,
}
impl Audio {
    pub fn frames(&self) -> usize {
        self.channels.first().map_or(0, Vec::len)
    }
    fn validate(&self, max_seconds: f64) -> Result<()> {
        let frames = self.frames();
        if !(8000..=192_000).contains(&self.rate) {
            return Err("CrispASR audio must be 8–192 kHz".into());
        }
        if self.channels.is_empty() || self.channels.len() > 2 {
            return Err("CrispASR audio tasks support mono or stereo".into());
        }
        if frames == 0 || self.channels.iter().any(|c| c.len() != frames) {
            return Err("CrispASR audio is empty or has unequal channels".into());
        }
        if frames as f64 / self.rate as f64 > max_seconds {
            return Err(format!(
                "Audio exceeds the {} minute limit for this task",
                max_seconds / 60.0
            ));
        }
        if self.channels.iter().flatten().any(|v| !v.is_finite()) {
            return Err("Non-finite PCM sample".into());
        }
        Ok(())
    }
    fn mono(&self) -> Vec<f32> {
        if self.channels.len() == 1 {
            return self.channels[0].clone();
        }
        self.channels[0]
            .iter()
            .zip(&self.channels[1])
            .map(|(l, r)| 0.5 * (l + r))
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Dynamic loading (no new crate dependency).

#[cfg(unix)]
mod dl {
    use std::ffi::{c_char, c_int, c_void, CStr};
    #[cfg_attr(target_os = "linux", link(name = "dl"))]
    extern "C" {
        fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
        fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
        fn dlerror() -> *const c_char;
    }
    const RTLD_NOW: c_int = 2;
    #[cfg(target_vendor = "apple")]
    const RTLD_LOCAL: c_int = 4;
    #[cfg(not(target_vendor = "apple"))]
    const RTLD_LOCAL: c_int = 0;
    pub unsafe fn open(path: &CStr) -> Result<*mut c_void, String> {
        let handle = dlopen(path.as_ptr(), RTLD_NOW | RTLD_LOCAL);
        if handle.is_null() {
            let error = dlerror();
            return Err(if error.is_null() {
                "unknown loader error".into()
            } else {
                CStr::from_ptr(error).to_string_lossy().into_owned()
            });
        }
        Ok(handle)
    }
    pub unsafe fn symbol(handle: *mut c_void, name: &CStr) -> *mut c_void {
        dlsym(handle, name.as_ptr())
    }
}

#[cfg(windows)]
mod dl {
    use std::ffi::{c_char, c_void, CStr};
    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryW(name: *const u16) -> *mut c_void;
        fn GetProcAddress(handle: *mut c_void, name: *const c_char) -> *mut c_void;
    }
    pub unsafe fn open(path: &CStr) -> Result<*mut c_void, String> {
        let wide: Vec<u16> = path
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let handle = LoadLibraryW(wide.as_ptr());
        if handle.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(handle)
    }
    pub unsafe fn symbol(handle: *mut c_void, name: &CStr) -> *mut c_void {
        GetProcAddress(handle, name.as_ptr())
    }
}

type Handle = *mut c_void;
#[derive(Clone, Copy)]
struct Api {
    open: unsafe extern "C" fn(*const c_char, c_int) -> Handle,
    close: unsafe extern "C" fn(Handle),
    separate: unsafe extern "C" fn(Handle, *const f32, c_int) -> c_int,
    stem_name: unsafe extern "C" fn(Handle, c_int) -> *const c_char,
    stem: unsafe extern "C" fn(Handle, c_int, *mut c_int) -> *const f32,
    separate_rate: unsafe extern "C" fn(Handle) -> c_int,
    s2s: unsafe extern "C" fn(Handle, *const f32, c_int, *mut *mut c_char, *mut c_int) -> *mut f32,
    input_rate: unsafe extern "C" fn(Handle) -> c_int,
    output_rate: unsafe extern "C" fn(Handle) -> c_int,
    pcm_free: unsafe extern "C" fn(*mut f32),
    beats: unsafe extern "C" fn(Handle, *const f32, c_int, c_int) -> c_int,
    beat_events: unsafe extern "C" fn(Handle, *mut c_int) -> *const f32,
    beat_rate: unsafe extern "C" fn(Handle) -> c_int,
    beat_tempo: unsafe extern "C" fn(Handle) -> f32,
    /// Raw Silero segments in centiseconds. The slice dispatcher is not used:
    /// it post-merges close segments and may fail over to fixed ASR chunks.
    vad_segments: unsafe extern "C" fn(
        *const c_char,
        *const f32,
        c_int,
        c_int,
        f32,
        c_int,
        c_int,
        c_int,
        bool,
        *mut *mut f32,
    ) -> c_int,
    vad_free: unsafe extern "C" fn(*mut f32),
}
// Function pointers into a never-unloaded library.
unsafe impl Send for Api {}
unsafe impl Sync for Api {}

struct Loaded {
    path: PathBuf,
    api: Api,
}
static LIBRARY: OnceLock<Mutex<Option<Loaded>>> = OnceLock::new();
/// ggml/Metal state is shared process-wide; run one CrispASR task at a time.
static CALLS: Mutex<()> = Mutex::new(());

fn library_name() -> &'static str {
    if cfg!(target_vendor = "apple") {
        "libcrispasr.dylib"
    } else if cfg!(windows) {
        "crispasr.dll"
    } else {
        "libcrispasr.so"
    }
}

/// Explicit path, then CRISPASR_LIB, then a copy next to (or in the app
/// bundle's Frameworks beside) the running executable; debug builds finally try
/// the checkout's staged src-tauri/generated/crispasr. No other search.
pub fn library_candidates(explicit: Option<&Path>) -> Vec<PathBuf> {
    if let Some(path) = explicit.filter(|p| !p.as_os_str().is_empty()) {
        return vec![path.to_path_buf()];
    }
    let mut out = vec![];
    if let Some(path) = std::env::var_os("CRISPASR_LIB").filter(|p| !p.is_empty()) {
        out.push(PathBuf::from(path));
    }
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(Path::to_path_buf))
    {
        out.push(dir.join(library_name()));
        out.push(dir.join("../Frameworks").join(library_name()));
        out.push(dir.join("../lib").join(library_name()));
    }
    // Development builds also find scripts/build-crispasr.sh output in the checkout.
    if cfg!(debug_assertions) {
        out.push(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../src-tauri/generated/crispasr")
                .join(library_name()),
        );
    }
    out
}

/// Reinterpret a resolved symbol as the declared C function pointer type.
unsafe fn function_pointer<T: Copy>(pointer: *mut c_void) -> T {
    assert_eq!(std::mem::size_of::<T>(), std::mem::size_of::<*mut c_void>());
    std::mem::transmute_copy(&pointer)
}

fn load(explicit: Option<&Path>) -> Result<Api> {
    let mut slot = LIBRARY.get_or_init(Default::default).lock().unwrap();
    let candidates = library_candidates(explicit);
    if let Some(loaded) = slot.as_ref() {
        // A loaded library is never unloaded: Metal/ggml globals stay alive.
        if explicit.is_some_and(|p| {
            !p.as_os_str().is_empty()
                && std::fs::canonicalize(p).ok() != std::fs::canonicalize(&loaded.path).ok()
        }) {
            return Err(format!(
                "CrispASR is already loaded from {}; restart to use another library",
                loaded.path.display()
            ));
        }
        return Ok(loaded.api);
    }
    let path = candidates
        .into_iter()
        .find(|p| p.is_file())
        .ok_or("CrispASR library not found: choose libcrispasr in Settings or set CRISPASR_LIB")?;
    let c_path = CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    let handle = unsafe { dl::open(&c_path) }
        .map_err(|e| format!("Cannot load CrispASR library {}: {e}", path.display()))?;
    macro_rules! sym {
        ($name:literal) => {{
            let pointer = unsafe {
                dl::symbol(
                    handle,
                    CStr::from_bytes_with_nul(concat!($name, "\0").as_bytes()).unwrap(),
                )
            };
            if pointer.is_null() {
                return Err(format!(
                    "CrispASR library lacks {} (update CrispASR)",
                    $name
                ));
            }
            unsafe { function_pointer(pointer) }
        }};
    }
    let api = Api {
        open: sym!("crispasr_session_open"),
        close: sym!("crispasr_session_close"),
        separate: sym!("crispasr_session_separate"),
        stem_name: sym!("crispasr_session_separate_stem_name"),
        stem: sym!("crispasr_session_separate_stem"),
        separate_rate: sym!("crispasr_session_separate_sample_rate"),
        s2s: sym!("crispasr_session_speech_to_speech"),
        input_rate: sym!("crispasr_session_input_sample_rate"),
        output_rate: sym!("crispasr_session_output_sample_rate"),
        pcm_free: sym!("crispasr_pcm_free"),
        beats: sym!("crispasr_session_beats"),
        beat_events: sym!("crispasr_session_beats_events"),
        beat_rate: sym!("crispasr_session_beats_sample_rate"),
        beat_tempo: sym!("crispasr_session_beats_tempo_bpm"),
        vad_segments: sym!("crispasr_vad_segments"),
        vad_free: sym!("crispasr_vad_free"),
    };
    *slot = Some(Loaded { path, api });
    Ok(api)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStatus {
    pub available: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}
/// Report (and load) the library without running a model.
pub fn library_status(explicit: Option<&Path>) -> LibraryStatus {
    if cfg!(any(target_os = "ios", target_os = "android")) {
        return LibraryStatus {
            available: false,
            path: None,
            error: Some("CrispASR audio tools are desktop-only".into()),
        };
    }
    match load(explicit) {
        Ok(_) => LibraryStatus {
            available: true,
            path: LIBRARY.get().and_then(|s| {
                s.lock()
                    .unwrap()
                    .as_ref()
                    .map(|l| l.path.display().to_string())
            }),
            error: None,
        },
        Err(error) => LibraryStatus {
            available: false,
            path: None,
            error: Some(error),
        },
    }
}

struct Session {
    api: Api,
    handle: Handle,
}
impl Session {
    fn open(api: Api, model: &Path) -> Result<Self> {
        if !model.is_file() {
            return Err(format!("Model file not found: {}", model.display()));
        }
        let c_model =
            CString::new(model.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8)) as c_int;
        let handle = unsafe { (api.open)(c_model.as_ptr(), threads) };
        if handle.is_null() {
            return Err(format!("CrispASR cannot open model {}", model.display()));
        }
        Ok(Self { api, handle })
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        unsafe { (self.api.close)(self.handle) };
    }
}

fn check_cancel() -> Result<()> {
    if crate::jobs::cancelled() {
        Err("Operation cancelled".into())
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Resampling and chunk assembly (pure, unit tested without a model).

fn bessel_i0(x: f64) -> f64 {
    let (mut sum, mut term, mut k) = (1.0, 1.0, 1.0);
    while term > 1e-12 * sum {
        term *= (x / (2.0 * k)).powi(2);
        sum += term;
        k += 1.0;
    }
    sum
}
/// Kaiser-windowed sinc resampler. Output length is round(len * to / from);
/// samples outside the input are treated as silence.
pub fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    const ZEROS: usize = 24;
    const RES: usize = 256;
    const BETA: f64 = 8.6;
    let ratio = to as f64 / from as f64;
    let out_len = (input.len() as f64 * ratio).round() as usize;
    let cutoff = ratio.min(1.0) * 0.97;
    let norm = bessel_i0(BETA);
    let table: Vec<f64> = (0..=ZEROS * RES + 1)
        .map(|i| {
            let t = i as f64 / RES as f64;
            let sinc = if t == 0.0 {
                1.0
            } else {
                (std::f64::consts::PI * t).sin() / (std::f64::consts::PI * t)
            };
            let x = (t / ZEROS as f64).min(1.0);
            sinc * bessel_i0(BETA * (1.0 - x * x).max(0.0).sqrt()) / norm
        })
        .collect();
    let half = (ZEROS as f64 / cutoff).ceil() as isize;
    let limit = (ZEROS * RES) as f64;
    (0..out_len)
        .map(|j| {
            let position = j as f64 / ratio;
            let centre = position.floor() as isize;
            let mut acc = 0.0f64;
            for k in (centre - half + 1)..=(centre + half) {
                if k < 0 || k as usize >= input.len() {
                    continue;
                }
                let f = (position - k as f64).abs() * cutoff * RES as f64;
                if f >= limit {
                    continue;
                }
                let i = f as usize;
                let w = table[i] + (table[i + 1] - table[i]) * (f - i as f64);
                acc += input[k as usize] as f64 * w;
            }
            (acc * cutoff) as f32
        })
        .collect()
}

/// Fit a converted signal to `frames`, allowing only a bounded model/rounding
/// length difference. Larger mismatches are errors, never silent stretching.
fn fit_length(mut pcm: Vec<f32>, frames: usize, tolerance: usize) -> Result<Vec<f32>> {
    if pcm.len().abs_diff(frames) > tolerance {
        return Err(format!(
            "CrispASR output length {} differs from the expected {} frames",
            pcm.len(),
            frames
        ));
    }
    pcm.resize(frames, 0.0);
    Ok(pcm)
}

/// Overlapping chunk windows covering `frames`: (start, length).
fn chunk_windows(frames: usize, chunk: usize, overlap: usize) -> Vec<(usize, usize)> {
    if frames <= chunk {
        return vec![(0, frames)];
    }
    let step = chunk - overlap;
    let mut out = vec![];
    let mut start = 0;
    loop {
        let length = chunk.min(frames - start);
        out.push((start, length));
        if start + length >= frames {
            break;
        }
        start += step;
    }
    out
}

/// Add one chunk into `target`, crossfading linearly over the overlap with the
/// previously written region. `written` is the end of already-final samples.
fn overlap_add(target: &mut [f32], chunk: &[f32], start: usize, overlap: usize, written: usize) {
    for (i, &v) in chunk.iter().enumerate() {
        let at = start + i;
        if at >= target.len() {
            break;
        }
        if at < written {
            let fade_len = written.saturating_sub(start).min(overlap).max(1);
            let w = (i as f32 + 0.5) / fade_len as f32;
            target[at] = target[at] * (1.0 - w) + v * w;
        } else {
            target[at] = v;
        }
    }
}

// ---------------------------------------------------------------------------
// Tasks.

pub struct Stem {
    pub name: String,
    pub audio: Audio,
}

/// Split audio into the model's stems (mel-band-roformer, htdemucs,
/// mini-bs-roformer). Output keeps the input rate, channel count and length.
pub fn separate(library: Option<&Path>, model: &Path, audio: &Audio) -> Result<Vec<Stem>> {
    audio.validate(20.0 * 60.0)?;
    let api = load(library)?;
    let _serial = CALLS.lock().unwrap_or_else(|e| e.into_inner());
    check_cancel()?;
    let session = Session::open(api, model)?;
    let rate = unsafe { (api.separate_rate)(session.handle) };
    if rate <= 0 {
        return Err("Model is not a CrispASR source-separation model".into());
    }
    let rate = rate as u32;
    let left = resample(&audio.channels[0], audio.rate, rate);
    let right = if audio.channels.len() == 2 {
        resample(&audio.channels[1], audio.rate, rate)
    } else {
        left.clone()
    };
    let frames = left.len();
    let (chunk, overlap) = (30 * rate as usize, 2 * rate as usize);
    let mut names: Vec<String> = vec![];
    let mut stems: Vec<[Vec<f32>; 2]> = vec![];
    let mut written = 0;
    for (start, length) in chunk_windows(frames, chunk, overlap) {
        check_cancel()?;
        let mut interleaved = Vec::with_capacity(length * 2);
        for i in start..start + length {
            interleaved.push(left[i]);
            interleaved.push(right[i]);
        }
        let count =
            unsafe { (api.separate)(session.handle, interleaved.as_ptr(), length as c_int) };
        if count <= 0 {
            return Err("CrispASR separation produced no stems".into());
        }
        if !names.is_empty() && names.len() != count as usize {
            return Err("CrispASR stem count changed between chunks".into());
        }
        for index in 0..count {
            let name_ptr = unsafe { (api.stem_name)(session.handle, index) };
            let name = if name_ptr.is_null() {
                format!("stem{index}")
            } else {
                unsafe { CStr::from_ptr(name_ptr) }
                    .to_string_lossy()
                    .into_owned()
            };
            let mut n: c_int = 0;
            let data = unsafe { (api.stem)(session.handle, index, &mut n) };
            if data.is_null() || n <= 0 {
                return Err(format!("CrispASR stem {name} is empty"));
            }
            let pcm = unsafe { std::slice::from_raw_parts(data, n as usize * 2) };
            if pcm.iter().any(|v| !v.is_finite()) {
                return Err(format!("CrispASR stem {name} contains non-finite samples"));
            }
            let stem_frames = (n as usize).min(length);
            if (n as usize).abs_diff(length) > 1 {
                return Err(format!(
                    "CrispASR stem {name} has {n} frames for a {length}-frame chunk"
                ));
            }
            if names.len() < count as usize {
                names.push(name.clone());
                stems.push([vec![0.0; frames], vec![0.0; frames]]);
            } else if names[index as usize] != name {
                return Err("CrispASR stem names changed between chunks".into());
            }
            for (channel, target) in stems[index as usize].iter_mut().enumerate() {
                let samples: Vec<f32> = (0..stem_frames).map(|i| pcm[i * 2 + channel]).collect();
                overlap_add(target, &samples, start, overlap, written);
            }
        }
        written = start + length;
    }
    check_cancel()?;
    let mut out = vec![];
    for (name, [l, r]) in names.into_iter().zip(stems) {
        let back = |pcm: &[f32]| fit_length(resample(pcm, rate, audio.rate), audio.frames(), 2);
        let channels = if audio.channels.len() == 1 {
            let mono: Vec<f32> = l.iter().zip(&r).map(|(a, b)| 0.5 * (a + b)).collect();
            vec![back(&mono)?]
        } else {
            vec![back(&l)?, back(&r)?]
        };
        out.push(Stem {
            name,
            audio: Audio {
                rate: audio.rate,
                channels,
            },
        });
    }
    Ok(out)
}

/// Generative speech restoration (sidon / voxcpm2-vae). The voice is
/// resynthesised, not repaired: callers must label results accordingly.
/// Returns mono at the input rate and length.
pub fn regenerate_speech(library: Option<&Path>, model: &Path, audio: &Audio) -> Result<Audio> {
    audio.validate(20.0 * 60.0)?;
    let api = load(library)?;
    let _serial = CALLS.lock().unwrap_or_else(|e| e.into_inner());
    check_cancel()?;
    let session = Session::open(api, model)?;
    let (input_rate, output_rate) = unsafe {
        (
            (api.input_rate)(session.handle),
            (api.output_rate)(session.handle),
        )
    };
    if input_rate <= 0 || output_rate <= 0 {
        return Err("Model is not a CrispASR speech-to-speech restoration model".into());
    }
    let (input_rate, output_rate) = (input_rate as u32, output_rate as u32);
    let mono = resample(&audio.mono(), audio.rate, input_rate);
    let scale = output_rate as f64 / input_rate as f64;
    let output_frames = (mono.len() as f64 * scale).round() as usize;
    let (chunk, overlap) = (20 * input_rate as usize, input_rate as usize);
    let out_overlap = (overlap as f64 * scale).round() as usize;
    let mut result = vec![0.0f32; output_frames];
    let mut written = 0;
    for (start, length) in chunk_windows(mono.len(), chunk, overlap) {
        check_cancel()?;
        let mut n: c_int = 0;
        let pcm = unsafe {
            (api.s2s)(
                session.handle,
                mono[start..start + length].as_ptr(),
                length as c_int,
                std::ptr::null_mut(),
                &mut n,
            )
        };
        if pcm.is_null() || n <= 0 {
            if !pcm.is_null() {
                unsafe { (api.pcm_free)(pcm) };
            }
            return Err("CrispASR speech regeneration returned no audio".into());
        }
        let samples = unsafe { std::slice::from_raw_parts(pcm, n as usize) }.to_vec();
        unsafe { (api.pcm_free)(pcm) };
        if samples.iter().any(|v| !v.is_finite()) {
            return Err("CrispASR speech regeneration returned non-finite samples".into());
        }
        let expected = (length as f64 * scale).round() as usize;
        // Codec models pad to whole hops; allow up to 50 ms either way.
        let samples = fit_length(samples, expected, (output_rate as usize / 20).max(1))?;
        let out_start = (start as f64 * scale).round() as usize;
        overlap_add(&mut result, &samples, out_start, out_overlap, written);
        written = out_start + expected;
    }
    check_cancel()?;
    Ok(Audio {
        rate: audio.rate,
        channels: vec![fit_length(
            resample(&result, output_rate, audio.rate),
            audio.frames(),
            2,
        )?],
    })
}

#[derive(Clone, Debug, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VadOptions {
    /// Speech probability threshold; <= 0 uses 0.5.
    pub threshold: f32,
    pub min_speech_ms: i32,
    pub min_silence_ms: i32,
    pub pad_ms: i32,
}
impl Default for VadOptions {
    fn default() -> Self {
        Self {
            threshold: 0.0,
            min_speech_ms: 250,
            min_silence_ms: 100,
            pad_ms: 30,
        }
    }
}

/// Speech regions in seconds on the input clock, sorted and non-overlapping.
/// Requires a Silero (whisper.cpp VAD) model such as ggml-silero-v6.2.0.bin.
pub fn speech_regions(
    library: Option<&Path>,
    model: &Path,
    audio: &Audio,
    options: &VadOptions,
) -> Result<Vec<(f64, f64)>> {
    audio.validate(4.0 * 3600.0)?;
    if !(0..=10_000).contains(&options.min_speech_ms)
        || !(0..=10_000).contains(&options.min_silence_ms)
        || !(0..=2_000).contains(&options.pad_ms)
        || !options.threshold.is_finite()
        || options.threshold >= 1.0
    {
        return Err("Invalid voice-activity options".into());
    }
    if !model.is_file() {
        return Err(format!("Model file not found: {}", model.display()));
    }
    let api = load(library)?;
    let _serial = CALLS.lock().unwrap_or_else(|e| e.into_inner());
    check_cancel()?;
    let pcm = resample(&audio.mono(), audio.rate, 16_000);
    let c_model = CString::new(model.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    let mut spans: *mut f32 = std::ptr::null_mut();
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8)) as c_int;
    let n = unsafe {
        (api.vad_segments)(
            c_model.as_ptr(),
            pcm.as_ptr(),
            pcm.len() as c_int,
            16_000,
            if options.threshold > 0.0 {
                options.threshold
            } else {
                0.5
            },
            options.min_speech_ms,
            options.min_silence_ms,
            threads,
            false,
            &mut spans,
        )
    };
    if n < 0 {
        return Err(format!("CrispASR voice activity detection failed ({n})"));
    }
    let raw: Vec<f32> = if n > 0 && !spans.is_null() {
        let copy = unsafe { std::slice::from_raw_parts(spans, n as usize * 2) }.to_vec();
        unsafe { (api.vad_free)(spans) };
        copy
    } else {
        vec![]
    };
    check_cancel()?;
    let duration = audio.frames() as f64 / audio.rate as f64;
    let pad = options.pad_ms as f64 / 1000.0;
    normalize_regions(
        raw.chunks(2)
            .map(|p| (p[0] as f64 / 100.0 - pad, p[1] as f64 / 100.0 + pad))
            .collect(),
        duration,
    )
}

fn normalize_regions(mut regions: Vec<(f64, f64)>, duration: f64) -> Result<Vec<(f64, f64)>> {
    if regions
        .iter()
        .any(|(a, b)| !a.is_finite() || !b.is_finite())
    {
        return Err("CrispASR returned invalid speech regions".into());
    }
    regions.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut out: Vec<(f64, f64)> = vec![];
    for (a, b) in regions {
        let (a, b) = (a.clamp(0.0, duration), b.clamp(0.0, duration));
        if b <= a {
            continue;
        }
        match out.last_mut() {
            Some(last) if a <= last.1 => last.1 = last.1.max(b),
            _ => out.push((a, b)),
        }
    }
    Ok(out)
}

/// Interior silences between speech regions that are at least `min_pause` long.
/// Leading and trailing silence are not pauses and are never returned.
pub fn pauses(regions: &[(f64, f64)], min_pause: f64) -> Vec<(f64, f64)> {
    regions
        .windows(2)
        .map(|w| (w[0].1, w[1].0))
        .filter(|(a, b)| b - a >= min_pause - 1e-9)
        .collect()
}

/// Shorten each pause to `keep` seconds by removing its centre. Picture
/// projects round removals inward to whole frames. Returns removal ranges.
pub fn pause_cuts(pauses: &[(f64, f64)], keep: f64, fps: Option<f64>) -> Result<Vec<(f64, f64)>> {
    if !keep.is_finite() || keep < 0.0 {
        return Err("Invalid kept pause length".into());
    }
    if fps.is_some_and(|f| !f.is_finite() || f <= 0.0) {
        return Err("Invalid frame rate".into());
    }
    let mut out = vec![];
    let mut previous_end = f64::NEG_INFINITY;
    for &(a, b) in pauses {
        if !a.is_finite() || !b.is_finite() || a < 0.0 || b <= a || a < previous_end - 1e-9 {
            return Err("Pauses must be ordered, positive and non-overlapping".into());
        }
        previous_end = b;
        let mut start = a + keep / 2.0;
        let mut end = b - keep / 2.0;
        if let Some(fps) = fps {
            start = (start * fps - 1e-7).ceil() / fps;
            end = (end * fps + 1e-7).floor() / fps;
        }
        if end - start > 1e-6 {
            out.push((start, end));
        }
    }
    if out.len() > 2000 {
        return Err("More than 2000 cuts: edit a shorter section".into());
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Beat {
    pub time: f64,
    pub downbeat: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeatGrid {
    pub tempo_bpm: f64,
    pub beats: Vec<Beat>,
}

/// Beat/downbeat positions on the input clock (Beat This!).
pub fn beats(library: Option<&Path>, model: &Path, audio: &Audio) -> Result<BeatGrid> {
    audio.validate(60.0 * 60.0)?;
    let api = load(library)?;
    let _serial = CALLS.lock().unwrap_or_else(|e| e.into_inner());
    check_cancel()?;
    let session = Session::open(api, model)?;
    let rate = unsafe { (api.beat_rate)(session.handle) };
    if rate <= 0 {
        return Err("Model is not a CrispASR beat-tracking model".into());
    }
    let pcm = resample(&audio.mono(), audio.rate, rate as u32);
    let n = unsafe { (api.beats)(session.handle, pcm.as_ptr(), pcm.len() as c_int, rate) };
    if n < 0 {
        return Err("CrispASR beat tracking failed".into());
    }
    let mut count: c_int = 0;
    let events = unsafe { (api.beat_events)(session.handle, &mut count) };
    let flat = if events.is_null() || count <= 0 {
        vec![]
    } else {
        unsafe { std::slice::from_raw_parts(events, count as usize * 2) }.to_vec()
    };
    let duration = audio.frames() as f64 / audio.rate as f64;
    let mut beats: Vec<Beat> = vec![];
    for pair in flat.chunks(2) {
        let time = pair[0] as f64;
        if !time.is_finite() || time < 0.0 || time > duration + 1e-3 {
            return Err("CrispASR returned an invalid beat time".into());
        }
        if beats.last().is_some_and(|b| time <= b.time) {
            return Err("CrispASR returned unordered beats".into());
        }
        beats.push(Beat {
            time: time.min(duration),
            downbeat: pair[1] != 0.0,
        });
    }
    let tempo = unsafe { (api.beat_tempo)(session.handle) } as f64;
    Ok(BeatGrid {
        tempo_bpm: if tempo.is_finite() && tempo > 0.0 {
            tempo
        } else {
            0.0
        },
        beats,
    })
}

// ---------------------------------------------------------------------------
// File helpers for the CLI.

/// Read a WAV directly, or decode other formats through the explicit Apple
/// helper. Never silently falls back to FFmpeg.
pub fn read_audio(path: &str) -> Result<Audio> {
    let read = |path: &Path| -> Result<Audio> {
        let mut reader = hound::WavReader::open(path).map_err(|e| e.to_string())?;
        let spec = reader.spec();
        if spec.channels == 0 || spec.channels > 2 {
            return Err("CrispASR audio tasks support mono or stereo input".into());
        }
        let samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Float => reader
                .samples::<f32>()
                .collect::<std::result::Result<_, _>>()
                .map_err(|e| e.to_string())?,
            hound::SampleFormat::Int => {
                let scale = 2f32.powi(spec.bits_per_sample as i32 - 1);
                reader
                    .samples::<i32>()
                    .map(|s| s.map(|v| v as f32 / scale))
                    .collect::<std::result::Result<_, _>>()
                    .map_err(|e| e.to_string())?
            }
        };
        let channels = spec.channels as usize;
        Ok(Audio {
            rate: spec.sample_rate,
            channels: (0..channels)
                .map(|c| samples.iter().skip(c).step_by(channels).copied().collect())
                .collect(),
        })
    };
    if let Ok(audio) = read(Path::new(path)) {
        return Ok(audio);
    }
    let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
    let pcm = directory.path().join("decoded.wav");
    if crate::apple::attempt(
        crate::apple::Backend::Apple,
        &[
            "audio-f32".into(),
            path.into(),
            pcm.to_string_lossy().into_owned(),
        ],
        None,
    )?
    .is_none()
    {
        return Err("Input is not a readable WAV and native decoding is unavailable".into());
    }
    read(&pcm)
}

/// Float WAV via owned staging, published with a no-overwrite hard link.
pub fn write_audio(path: &Path, audio: &Audio) -> Result<()> {
    if path.exists() {
        return Err(format!("Output already exists: {}", path.display()));
    }
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let staging = tempfile::Builder::new()
        .prefix(".crispaudio-")
        .suffix(".wav")
        .tempfile_in(parent)
        .map_err(|e| e.to_string())?;
    {
        let spec = hound::WavSpec {
            channels: audio.channels.len() as u16,
            sample_rate: audio.rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = hound::WavWriter::new(
            std::io::BufWriter::new(staging.as_file().try_clone().map_err(|e| e.to_string())?),
            spec,
        )
        .map_err(|e| e.to_string())?;
        for i in 0..audio.frames() {
            for channel in &audio.channels {
                writer.write_sample(channel[i]).map_err(|e| e.to_string())?;
            }
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }
    staging.as_file().sync_all().map_err(|e| e.to_string())?;
    std::fs::hard_link(staging.path(), path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Render a .crispaudio document's mix (native mixer) for analysis.
pub fn render_project_mix(doc: &serde_json::Value) -> Result<Audio> {
    let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
    let wav = directory.path().join("mix.wav");
    crate::audio_mix::render(doc, wav.to_str().ok_or("Invalid temporary path")?)?;
    read_audio(wav.to_str().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(rate: u32, freq: f64, seconds: f64) -> Vec<f32> {
        (0..(rate as f64 * seconds) as usize)
            .map(|i| (2.0 * std::f64::consts::PI * freq * i as f64 / rate as f64).sin() as f32)
            .collect()
    }

    #[test]
    fn resampler_preserves_in_band_tones_and_length() {
        for (from, to) in [
            (48_000, 44_100),
            (44_100, 48_000),
            (48_000, 16_000),
            (16_000, 48_000),
        ] {
            let input = sine(from, 1000.0, 1.0);
            let output = resample(&input, from, to);
            assert_eq!(output.len(), to as usize);
            let expected = sine(to, 1000.0, 1.0);
            // Ignore filter edges.
            let edge = to as usize / 50;
            let error = output[edge..output.len() - edge]
                .iter()
                .zip(&expected[edge..expected.len() - edge])
                .map(|(a, b)| (a - b).abs())
                .fold(0.0f32, f32::max);
            assert!(error < 2e-3, "{from}->{to} error {error}");
        }
    }

    #[test]
    fn resampler_rejects_content_above_new_nyquist() {
        let input = sine(48_000, 12_000.0, 1.0);
        let output = resample(&input, 48_000, 16_000);
        let peak = output[400..output.len() - 400]
            .iter()
            .fold(0.0f32, |m, v| m.max(v.abs()));
        assert!(peak < 1e-3, "alias peak {peak}");
    }

    #[test]
    fn chunks_cover_audio_with_overlap() {
        assert_eq!(chunk_windows(10, 30, 2), vec![(0, 10)]);
        let windows = chunk_windows(100, 30, 5);
        assert_eq!(windows[0], (0, 30));
        assert_eq!(windows[1], (25, 30));
        let last = windows.last().unwrap();
        assert_eq!(last.0 + last.1, 100);
        for pair in windows.windows(2) {
            assert_eq!(pair[1].0, pair[0].0 + 25);
        }
    }

    #[test]
    fn overlap_add_reconstructs_identical_chunks_exactly() {
        let signal: Vec<f32> = (0..100).map(|i| (i as f32 * 0.37).sin()).collect();
        let mut out = vec![0.0; 100];
        let mut written = 0;
        for (start, length) in chunk_windows(100, 30, 6) {
            overlap_add(&mut out, &signal[start..start + length], start, 6, written);
            written = start + length;
        }
        for (a, b) in out.iter().zip(&signal) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn fit_length_is_bounded() {
        assert_eq!(fit_length(vec![1.0; 9], 10, 1).unwrap().len(), 10);
        assert!(fit_length(vec![1.0; 5], 10, 2).is_err());
    }

    #[test]
    fn regions_merge_clamp_and_produce_interior_pauses() {
        let regions =
            normalize_regions(vec![(2.0, 3.0), (0.5, 1.0), (0.9, 1.2), (5.0, 9.0)], 8.0).unwrap();
        assert_eq!(regions, vec![(0.5, 1.2), (2.0, 3.0), (5.0, 8.0)]);
        assert_eq!(pauses(&regions, 1.0), vec![(3.0, 5.0)]);
        assert_eq!(pauses(&regions, 0.5), vec![(1.2, 2.0), (3.0, 5.0)]);
    }

    #[test]
    fn pause_cuts_keep_centre_gap_and_align_frames_inward() {
        let cuts = pause_cuts(&[(1.0, 3.0)], 0.4, None).unwrap();
        assert_eq!(cuts.len(), 1);
        assert!((cuts[0].0 - 1.2).abs() < 1e-9 && (cuts[0].1 - 2.8).abs() < 1e-9);
        let framed = pause_cuts(&[(1.01, 3.01)], 0.4, Some(25.0)).unwrap();
        assert!((framed[0].0 - 1.24).abs() < 1e-9 && (framed[0].1 - 2.8).abs() < 1e-9);
        assert!(pause_cuts(&[(1.0, 1.3)], 0.4, None).unwrap().is_empty());
        assert!(pause_cuts(&[(2.0, 3.0), (1.0, 1.5)], 0.1, None).is_err());
    }

    #[test]
    fn missing_library_is_an_explicit_error() {
        let status = library_status(Some(Path::new("/nonexistent/libcrispasr.dylib")));
        if LIBRARY
            .get()
            .and_then(|s| s.lock().unwrap().as_ref().map(|_| ()))
            .is_none()
        {
            assert!(!status.available);
            assert!(status.error.unwrap().contains("not found"));
        }
    }

    /// Real-model check: CRISPASR_LIB and CRISPASR_TEST_MODELS (directory with
    /// mel-band-roformer-vocals-f16.gguf, ggml-silero-v6.2.0.bin,
    /// beat-this-f16.gguf, sidon-v0.1-q8_0.gguf) must be set explicitly.
    #[test]
    #[ignore]
    fn real_models() {
        let models = PathBuf::from(std::env::var("CRISPASR_TEST_MODELS").unwrap());
        let rate = 48_000;
        let mut speechish = vec![0.0f32; rate as usize * 6];
        for (i, v) in speechish.iter_mut().enumerate() {
            let t = i as f64 / rate as f64;
            if (1.0..2.5).contains(&t) || (4.0..5.0).contains(&t) {
                *v = (0.3
                    * (2.0 * std::f64::consts::PI * 220.0 * t).sin()
                    * (1.0 + (2.0 * std::f64::consts::PI * 4.0 * t).sin()))
                    as f32;
            }
        }
        let audio = Audio {
            rate,
            channels: vec![speechish.clone(), speechish],
        };
        let stems = separate(
            None,
            &models.join("mel-band-roformer-vocals-f16.gguf"),
            &audio,
        )
        .unwrap();
        assert!(stems.len() >= 2);
        assert!(stems
            .iter()
            .all(|s| s.audio.frames() == audio.frames() && s.audio.channels.len() == 2));
        let regions = speech_regions(
            None,
            &models.join("ggml-silero-v6.2.0.bin"),
            &audio,
            &VadOptions::default(),
        )
        .unwrap();
        eprintln!("regions {regions:?}");
        assert_eq!(regions.len(), 2, "separate utterances must stay separate");
        assert_eq!(pauses(&regions, 0.7).len(), 1);
        let grid = beats(None, &models.join("beat-this-f16.gguf"), &audio).unwrap();
        eprintln!("tempo {} beats {}", grid.tempo_bpm, grid.beats.len());
        let speech = regenerate_speech(None, &models.join("sidon-v0.1-q8_0.gguf"), &audio).unwrap();
        assert_eq!(speech.frames(), audio.frames());
    }
}
