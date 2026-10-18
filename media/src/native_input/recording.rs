//! Native dry-file worker. No disk work belongs on an audio callback.
//! Unpublished WAV + append-only checksummed block index survive interruption.
use super::{Fault, Packet, Reader, DRY_SLOTS, MAX_FRAMES};
use crate::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{File, OpenOptions},
    io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const RATE: u32 = 48000;
const MAGIC: &[u8; 8] = b"CRSPREC1";
const MAX_BLOCKS: u64 = 1 << 21;
const MAX_DATA: u64 = u32::MAX as u64 - 4096;
const CHECKPOINT_FRAMES: u64 = RATE as u64;
const AUDIO: &str = "audio.partial.wav";
const INDEX: &str = "blocks.bin";
const META: &str = "take.json";
const COMPLETE: &str = "take.wav";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Metadata {
    version: u32,
    id: String,
    created_ms: u64,
    sample_rate: u32,
    channels: u16,
    data_offset: u64,
    max_frames: u64,
    context: Value,
}
impl Metadata {
    fn validate(&self) -> Result<()> {
        if self.version != 1
            || self.id.is_empty()
            || self.id.len() > 128
            || self.sample_rate != RATE
            || !(1..=2).contains(&self.channels)
            || !(44..=4096).contains(&self.data_offset)
            || self.max_frames == 0
            || self.max_frames > MAX_DATA / (self.channels as u64 * 4)
            || !self.context.is_object()
            || self.context.to_string().len() > 16384
        {
            return Err("Invalid native recording metadata".into());
        }
        Ok(())
    }
    fn spec(&self) -> hound::WavSpec {
        hound::WavSpec {
            channels: self.channels,
            sample_rate: RATE,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TakeInfo {
    pub frames: u64,
    pub first_input_frame: u64,
    pub first_host_time: u64,
    pub channels: u16,
    pub sample_rate: u32,
    pub context: Value,
}
#[derive(Debug)]
pub struct CompletedTake {
    pub path: PathBuf,
    pub recovery_directory: PathBuf,
    pub info: TakeInfo,
}
#[derive(Debug)]
pub struct RecoveredTake {
    pub path: PathBuf,
    pub info: TakeInfo,
    /// Recovery never establishes that the original capture ended cleanly.
    pub incomplete: bool,
    pub stopped_reason: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    Idle,
    Written,
    Ended,
    Interrupted(Fault),
}

fn io<T>(result: std::io::Result<T>) -> Result<T> {
    result.map_err(|error| error.to_string())
}
fn hash(parts: &[&[u8]]) -> u64 {
    parts
        .iter()
        .flat_map(|part| part.iter())
        .fold(14695981039346656037u64, |hash, byte| {
            (hash ^ *byte as u64).wrapping_mul(1099511628211)
        })
}
fn create(path: &Path) -> Result<File> {
    io(OpenOptions::new().write(true).create_new(true).open(path))
}
fn regular(path: &Path) -> Result<File> {
    if !io(std::fs::symlink_metadata(path))?.is_file() {
        return Err("Recording source is not a regular file".into());
    }
    io(File::open(path))
}
fn sync_directory(path: &Path) -> Result<()> {
    #[cfg(unix)]
    io(File::open(path).and_then(|file| file.sync_all()))?;
    #[cfg(not(unix))]
    let _ = path; // File data is synced; directory fsync is platform-specific.
    Ok(())
}
fn info(meta: &Metadata, frames: u64, first: Option<(u64, u64)>) -> Result<TakeInfo> {
    let (first_input_frame, first_host_time) =
        first.ok_or("Recording has no recoverable samples")?;
    Ok(TakeInfo {
        frames,
        first_input_frame,
        first_host_time,
        channels: meta.channels,
        sample_rate: RATE,
        context: meta.context.clone(),
    })
}

pub struct Recorder {
    directory: PathBuf,
    meta: Metadata,
    reader: Reader<DRY_SLOTS>,
    wave: Option<hound::WavWriter<BufWriter<File>>>,
    wave_sync: File,
    index: BufWriter<File>,
    index_sync: File,
    frames: u64,
    blocks: u64,
    first: Option<(u64, u64)>,
    next: Option<u64>,
    checkpoint_frames: u64,
    failed: Option<String>,
    published: bool,
}
impl Recorder {
    /// Create in an app-owned durable directory before opening capture. Mono
    /// writes the left (already selected/mapped) input channel, without folding.
    /// max_frames is a take limit, bounded by RIFF32. Context is opaque owner
    /// metadata (e.g. project/track IDs), never interpreted as filesystem paths.
    pub fn create(
        root: &Path,
        reader: Reader<DRY_SLOTS>,
        channels: u16,
        max_frames: u64,
        context: Value,
    ) -> Result<Self> {
        if !(1..=2).contains(&channels)
            || max_frames == 0
            || max_frames > MAX_DATA / (channels as u64 * 4)
            || !context.is_object()
            || context.to_string().len() > 16384
        {
            return Err("Invalid native recording configuration".into());
        }
        io(std::fs::create_dir_all(root))?;
        let folder = io(tempfile::Builder::new()
            .prefix("native-take-")
            .tempdir_in(root))?;
        let mut meta = Metadata {
            version: 1,
            id: folder.path().file_name().unwrap().to_string_lossy().into(),
            created_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis() as u64,
            sample_rate: RATE,
            channels,
            data_offset: 44,
            max_frames,
            context,
        };
        let file = create(&folder.path().join(AUDIO))?;
        let wave_sync = io(file.try_clone())?; // sync/metadata only: never seeks the shared cursor.
        let mut wave = hound::WavWriter::new(BufWriter::with_capacity(65536, file), meta.spec())
            .map_err(|e| e.to_string())?;
        wave.flush().map_err(|e| e.to_string())?;
        io(wave_sync.sync_all())?;
        meta.data_offset = io(wave_sync.metadata())?.len();
        meta.validate()?;
        let metadata = serde_json::to_vec(&meta).map_err(|e| e.to_string())?;
        let mut manifest = create(&folder.path().join(META))?;
        io(manifest.write_all(&metadata))?;
        io(manifest.sync_all())?;
        let file = create(&folder.path().join(INDEX))?;
        let index_sync = io(file.try_clone())?;
        let mut index = BufWriter::with_capacity(8192, file);
        io(index.write_all(MAGIC))?;
        io(index.write_all(&hash(&[&metadata]).to_le_bytes()))?;
        io(index.flush())?;
        io(index_sync.sync_all())?;
        sync_directory(folder.path())?;
        sync_directory(root)?;
        let directory = folder.keep(); // Never auto-delete captured originals.
        Ok(Self {
            directory,
            meta,
            reader,
            wave: Some(wave),
            wave_sync,
            index,
            index_sync,
            frames: 0,
            blocks: 0,
            first: None,
            next: None,
            checkpoint_frames: 0,
            failed: None,
            published: false,
        })
    }
    pub fn directory(&self) -> &Path {
        &self.directory
    }
    pub fn written_frames(&self) -> u64 {
        self.frames
    }
    fn fail<T>(&mut self, error: String) -> Result<T> {
        self.reader.status().fail(Fault::Storage);
        if self.failed.is_none() && self.wave.is_some() {
            let _ = self.checkpoint_inner();
        }
        let first = self.failed.get_or_insert(error);
        Err(first.clone())
    }
    fn append(&mut self, packet: &Packet) -> Result<()> {
        let samples = packet.samples();
        let length = samples.len();
        let end = packet
            .first_frame
            .checked_add(length as u64)
            .ok_or("Recording input clock overflow")?;
        if length == 0
            || length > MAX_FRAMES
            || self.next.is_some_and(|next| next != packet.first_frame)
            || self.frames + length as u64 > self.meta.max_frames
            || self.blocks >= MAX_BLOCKS
            || samples.iter().flatten().any(|sample| !sample.is_finite())
        {
            return Err("Native recording clock, PCM or take limit is invalid".into());
        }
        let channels = self.meta.channels as usize;
        let bytes = length * channels * 4;
        let mut pcm = [0u8; MAX_FRAMES * 8];
        for (frame, sample) in samples.iter().enumerate() {
            for channel in 0..channels {
                let offset = (frame * channels + channel) * 4;
                pcm[offset..offset + 4].copy_from_slice(&sample[channel].to_le_bytes());
            }
        }
        let mut record = [0u8; 32];
        record[..8].copy_from_slice(&packet.first_frame.to_le_bytes());
        record[8..16].copy_from_slice(&packet.host_time.to_le_bytes());
        record[16..20].copy_from_slice(&(length as u32).to_le_bytes());
        record[20..24].copy_from_slice(&(bytes as u32).to_le_bytes());
        let checksum = hash(&[&record[..24], &pcm[..bytes]]);
        record[24..].copy_from_slice(&checksum.to_le_bytes());
        let wave = self
            .wave
            .as_mut()
            .ok_or("Native recording is already finalized")?;
        for sample in samples {
            for channel in sample.iter().take(channels) {
                wave.write_sample(*channel).map_err(|e| e.to_string())?;
            }
        }
        io(self.index.write_all(&record))?;
        self.first
            .get_or_insert((packet.first_frame, packet.host_time));
        self.next = Some(end);
        self.frames += length as u64;
        self.blocks += 1;
        if self.frames - self.checkpoint_frames >= CHECKPOINT_FRAMES {
            self.checkpoint_inner()?;
        }
        Ok(())
    }
    fn checkpoint_inner(&mut self) -> Result<()> {
        self.wave
            .as_mut()
            .ok_or("Native recording is already finalized")?
            .flush()
            .map_err(|e| e.to_string())?;
        io(self.wave_sync.sync_all())?;
        io(self.index.flush())?;
        io(self.index_sync.sync_all())?;
        self.checkpoint_frames = self.frames;
        Ok(())
    }
    /// Off-callback durable checkpoint. Automatic checkpoints are roughly once
    /// per second of accepted audio; storage stalls may fault the bounded ingress.
    pub fn checkpoint(&mut self) -> Result<()> {
        if let Some(error) = &self.failed {
            return Err(error.clone());
        }
        match self.checkpoint_inner() {
            Ok(()) => Ok(()),
            Err(error) => self.fail(error),
        }
    }
    /// Native file-worker step; drains faulted input only as recoverable prefix.
    pub fn step(&mut self) -> Result<Step> {
        if let Some(error) = &self.failed {
            return Err(error.clone());
        }
        let Some(packet) = self.reader.pop() else {
            return Ok(if let Some(fault) = self.reader.status().fault() {
                Step::Interrupted(fault)
            } else if self.reader.status().closed() {
                Step::Ended
            } else {
                Step::Idle
            });
        };
        match self.append(&packet) {
            Ok(()) => Ok(Step::Written),
            Err(error) => self.fail(error),
        }
    }
    /// Call only after capture has synchronously stopped and closed its producer.
    /// No complete file is published unless dry status and owner frame count agree.
    pub fn finish(mut self, expected_frames: u64) -> Result<CompletedTake> {
        let result = (|| {
            if !self.reader.status().closed() {
                return Err("Native capture is still open".into());
            }
            while self.step()? == Step::Written {}
            self.checkpoint()?;
            if self.reader.status().fault().is_some()
                || self.frames != expected_frames
                || self.frames == 0
            {
                return Err("Native recording is incomplete; recovery files retained".into());
            }
            let info = info(&self.meta, self.frames, self.first)?;
            self.wave
                .take()
                .unwrap()
                .finalize()
                .map_err(|e| e.to_string())?;
            io(self.wave_sync.sync_all())?;
            let path = self.directory.join(COMPLETE);
            io(std::fs::hard_link(self.directory.join(AUDIO), &path))?;
            sync_directory(&self.directory)?;
            self.published = true;
            Ok(CompletedTake {
                path,
                recovery_directory: self.directory.clone(),
                info,
            })
        })();
        if let Err(error) = result {
            return self.fail(error);
        }
        result
    }
}
impl Drop for Recorder {
    fn drop(&mut self) {
        // Preserve cancellation/unwind prefixes, never publish a completed take.
        if self.wave.is_some() && self.failed.is_none() && self.checkpoint_inner().is_err() {
            self.reader.status().fail(Fault::Storage);
        }
        if !self.published {
            self.reader.status().fail(Fault::Cancelled);
        }
    }
}

fn read_record(reader: &mut impl Read, record: &mut [u8; 32]) -> Result<usize> {
    let mut offset = 0;
    while offset < record.len() {
        match reader.read(&mut record[offset..]) {
            Ok(0) => break,
            Ok(count) => offset += count,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(offset)
}
fn open_index(directory: &Path) -> Result<(Metadata, BufReader<File>)> {
    let mut manifest = regular(&directory.join(META))?;
    if io(manifest.metadata())?.len() > 32768 {
        return Err("Recording metadata exceeds limit".into());
    }
    let mut metadata = Vec::new();
    io((&mut manifest).take(32769).read_to_end(&mut metadata))?;
    if metadata.len() > 32768 {
        return Err("Recording metadata exceeds limit".into());
    }
    let meta: Metadata = serde_json::from_slice(&metadata).map_err(|e| e.to_string())?;
    meta.validate()?;
    let mut index = BufReader::new(regular(&directory.join(INDEX))?);
    let mut header = [0u8; 16];
    io(index.read_exact(&mut header))?;
    if &header[..8] != MAGIC || header[8..] != hash(&[&metadata]).to_le_bytes() {
        return Err("Native recording metadata/index mismatch".into());
    }
    Ok((meta, index))
}

/// Verify a COMPLETE recording's metadata, index and every PCM checksum before
/// trusting its clock observations. Visitor calls may precede a later error;
/// callers must not publish partial results. All I/O belongs off callback.
pub(super) fn visit_verified_clocks(
    directory: &Path,
    expected: &TakeInfo,
    mut visit: impl FnMut(u64, u64, usize) -> Result<()>,
) -> Result<()> {
    if expected.frames == 0 || expected.frames > 32_000_000 {
        return Err("Invalid recording verification budget".into());
    }
    let (meta, mut index) = open_index(directory)?;
    let wave = hound::WavReader::new(BufReader::new(regular(&directory.join(COMPLETE))?))
        .map_err(|e| e.to_string())?;
    if wave.spec() != meta.spec() || wave.duration() as u64 != expected.frames {
        return Err("Complete recording format mismatch".into());
    }
    let mut source = wave.into_inner();
    if io(source.stream_position())? != meta.data_offset
        || io(source.get_ref().metadata())?.len()
            != meta.data_offset + expected.frames * meta.channels as u64 * 4
    {
        return Err("Complete recording layout mismatch".into());
    }
    let (mut frames, mut blocks, mut first, mut next, mut last_host) =
        (0u64, 0u64, None, None, None);
    loop {
        let mut record = [0u8; 32];
        let count = read_record(&mut index, &mut record)?;
        if count == 0 {
            break;
        }
        if count != 32 {
            return Err("Partial recording clock index".into());
        }
        let frame = u64::from_le_bytes(record[..8].try_into().unwrap());
        let host = u64::from_le_bytes(record[8..16].try_into().unwrap());
        let length = u32::from_le_bytes(record[16..20].try_into().unwrap()) as usize;
        let bytes = u32::from_le_bytes(record[20..24].try_into().unwrap()) as usize;
        let end = frame.checked_add(length as u64);
        if !(1..=MAX_FRAMES).contains(&length)
            || bytes != length * meta.channels as usize * 4
            || end.is_none()
            || next.is_some_and(|next| next != frame)
            || last_host.is_some_and(|last| last >= host)
            || frames + length as u64 > expected.frames
            || frames + length as u64 > meta.max_frames
            || blocks >= MAX_BLOCKS
        {
            return Err("Invalid complete recording clock index".into());
        }
        let mut pcm = [0u8; MAX_FRAMES * 8];
        io(source.read_exact(&mut pcm[..bytes]))?;
        if record[24..] != hash(&[&record[..24], &pcm[..bytes]]).to_le_bytes()
            || pcm[..bytes]
                .chunks_exact(4)
                .any(|b| !f32::from_le_bytes(b.try_into().unwrap()).is_finite())
        {
            return Err("Complete recording checksum mismatch".into());
        }
        visit(frame, host, length)?;
        first.get_or_insert((frame, host));
        next = end;
        last_host = Some(host);
        frames += length as u64;
        blocks += 1;
    }
    if info(&meta, frames, first)? != *expected {
        return Err("Complete recording metadata mismatch".into());
    }
    Ok(())
}

/// Copy verified whole blocks to a fresh float WAV. Ignores the source's mutable
/// RIFF/data lengths, leaves all recovery files intact and never replaces output.
/// Recovery is always marked incomplete, even if every indexed block verifies.
pub fn recover(directory: &Path, output: &Path, cancel: &AtomicBool) -> Result<RecoveredTake> {
    let (meta, mut index) = open_index(directory)?;
    let mut source = BufReader::new(regular(&directory.join(AUDIO))?);
    io(source.seek(SeekFrom::Start(meta.data_offset)))?;
    let staged = crate::export_staging::directory(output)?;
    let path = staged.path().join("recovered.wav");
    let file = create(&path)?;
    let sync = io(file.try_clone())?;
    let mut wave =
        hound::WavWriter::new(BufWriter::new(file), meta.spec()).map_err(|e| e.to_string())?;
    let mut frames = 0u64;
    let mut blocks = 0u64;
    let mut first = None;
    let mut next = None;
    let stopped_reason = loop {
        if cancel.load(Ordering::Acquire) {
            return Err("Recording recovery cancelled".into());
        }
        let mut record = [0u8; 32];
        let count = read_record(&mut index, &mut record)?;
        if count == 0 {
            break None;
        }
        if count != record.len() {
            break Some("Partial block index".into());
        }
        let frame = u64::from_le_bytes(record[..8].try_into().unwrap());
        let host = u64::from_le_bytes(record[8..16].try_into().unwrap());
        let length = u32::from_le_bytes(record[16..20].try_into().unwrap()) as usize;
        let bytes = u32::from_le_bytes(record[20..24].try_into().unwrap()) as usize;
        let end = frame.checked_add(length as u64);
        if !(1..=MAX_FRAMES).contains(&length)
            || bytes != length * meta.channels as usize * 4
            || end.is_none()
            || next.is_some_and(|next| next != frame)
            || frames + length as u64 > meta.max_frames
            || blocks >= MAX_BLOCKS
        {
            break Some("Invalid block layout, clock or take limit".into());
        }
        let mut pcm = [0u8; MAX_FRAMES * 8];
        if let Err(error) = source.read_exact(&mut pcm[..bytes]) {
            if error.kind() == std::io::ErrorKind::UnexpectedEof {
                break Some("Partial audio block".into());
            }
            return Err(error.to_string());
        }
        if record[24..] != hash(&[&record[..24], &pcm[..bytes]]).to_le_bytes()
            || pcm[..bytes]
                .chunks_exact(4)
                .any(|bytes| !f32::from_le_bytes(bytes.try_into().unwrap()).is_finite())
        {
            break Some("Audio block checksum or sample validation failed".into());
        }
        for bytes in pcm[..bytes].chunks_exact(4) {
            wave.write_sample(f32::from_le_bytes(bytes.try_into().unwrap()))
                .map_err(|e| e.to_string())?;
        }
        first.get_or_insert((frame, host));
        next = end;
        frames += length as u64;
        blocks += 1;
    };
    let info = info(&meta, frames, first)?;
    wave.finalize().map_err(|e| e.to_string())?;
    io(sync.sync_all())?;
    if cancel.load(Ordering::Acquire) {
        return Err("Recording recovery cancelled".into());
    }
    io(std::fs::hard_link(&path, output))?;
    let parent = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    sync_directory(parent)?;
    Ok(RecoveredTake {
        path: output.to_owned(),
        info,
        incomplete: true,
        stopped_reason,
    })
}

#[cfg(test)]
mod tests;
