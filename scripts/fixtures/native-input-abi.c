/* Verify hand-written Rust FFI layouts/constants against the selected Mac SDK.
 * Syntax-only: no executable, device, permission prompt or audio queue is opened.
 */
#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>
#include <stddef.h>
#include <sys/sysctl.h>

_Static_assert(sizeof(void *) == 8, "Mac input FFI requires a 64-bit target");
_Static_assert(sizeof(AudioStreamBasicDescription) == 40, "ASBD layout");
_Static_assert(sizeof(AudioQueueBuffer) == 56, "AudioQueueBuffer layout");
_Static_assert(offsetof(AudioQueueBuffer, mAudioData) == 8, "Buffer data offset");
_Static_assert(offsetof(AudioQueueBuffer, mAudioDataByteSize) == 16, "Buffer size offset");
_Static_assert(offsetof(AudioQueueBuffer, mUserData) == 24, "Buffer user offset");
_Static_assert(offsetof(AudioQueueBuffer, mPacketDescriptions) == 40, "Packet offset");
_Static_assert(sizeof(AudioTimeStamp) == 64, "Timestamp layout");
_Static_assert(offsetof(AudioTimeStamp, mHostTime) == 8, "Host time offset");
_Static_assert(offsetof(AudioTimeStamp, mFlags) == 56, "Timestamp flags offset");
_Static_assert(kAudioTimeStampSampleTimeValid == 1, "Sample time flag");
_Static_assert(kAudioTimeStampHostTimeValid == 2, "Host time flag");
_Static_assert(kAudioFormatFlagIsFloat == 1, "Float PCM flag");
_Static_assert(kAudioFormatFlagIsPacked == 8, "Packed PCM flag");
_Static_assert(kAudioQueueProperty_CurrentDevice == 0x61716364, "Queue UID property");
_Static_assert(kAudioQueueProperty_StreamDescription == 0x61716674, "Queue format property");
_Static_assert(kAudioDevicePropertyStreamConfiguration == 0x736c6179, "Input channel configuration");
_Static_assert(kAudioDevicePropertyNominalSampleRate == 0x6e737274, "Input sample rate");
_Static_assert(kAudioDevicePropertyDeviceIsAlive == 0x6c69766e, "Input device liveness");
_Static_assert(kAudioHardwarePropertyDefaultInputDevice == 0x64496e20, "Default input property");

/* Output uses a real queue timeline, not a NULL timeline that cannot report
 * discontinuities. Verify these signatures as well as the shared PCM layouts. */
_Static_assert(kAudioHardwarePropertyDefaultOutputDevice == 0x644f7574, "Default output property");
_Static_assert(kAudioObjectPropertyScopeOutput == 0x6f757470, "Output scope");
_Static_assert(__builtin_types_compatible_p(__typeof__(&AudioQueueCreateTimeline),
    OSStatus (*)(AudioQueueRef, AudioQueueTimelineRef *)), "Create timeline ABI");
_Static_assert(__builtin_types_compatible_p(__typeof__(&AudioQueueGetCurrentTime),
    OSStatus (*)(AudioQueueRef, AudioQueueTimelineRef, AudioTimeStamp *, Boolean *)), "Queue clock ABI");
_Static_assert(__builtin_types_compatible_p(__typeof__(&AudioQueueNewOutput),
    OSStatus (*)(const AudioStreamBasicDescription *, AudioQueueOutputCallback, void *,
                 CFRunLoopRef, CFStringRef, UInt32, AudioQueueRef *)), "New output ABI");

/* Native recording context reads this value; it never writes kernel state. */
_Static_assert(__builtin_types_compatible_p(__typeof__(&sysctlbyname),
    int (*)(const char *, void *, size_t *, void *, size_t)), "Boot identity query ABI");
