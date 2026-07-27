#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 6) {
      fprintf(
          stderr,
          "Usage: synthesize-speech output voice-id pitch web-rate text\n"
      );
      return 64;
    }

    NSString *outputPath = [NSString stringWithUTF8String:argv[1]];
    NSString *voiceIdentifier = [NSString stringWithUTF8String:argv[2]];
    float pitch = strtof(argv[3], NULL);
    float webRate = strtof(argv[4], NULL);
    NSString *text = [NSString stringWithUTF8String:argv[5]];

    AVSpeechSynthesisVoice *voice =
        [AVSpeechSynthesisVoice voiceWithIdentifier:voiceIdentifier];
    if (!voice) {
      fprintf(stderr, "Requested macOS speech voice is unavailable.\n");
      return 65;
    }

    [[NSFileManager defaultManager]
        removeItemAtPath:outputPath
                   error:nil];

    AVSpeechUtterance *utterance =
        [AVSpeechUtterance speechUtteranceWithString:text];
    utterance.voice = voice;
    utterance.pitchMultiplier = pitch;
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * webRate;
    utterance.volume = 1;

    AVSpeechSynthesizer *synthesizer = [[AVSpeechSynthesizer alloc] init];
    __block AVAudioFile *audioFile = nil;
    __block BOOL finished = NO;
    __block NSError *failure = nil;

    [synthesizer
        writeUtterance:utterance
        toBufferCallback:^(AVAudioBuffer *buffer) {
          AVAudioPCMBuffer *pcmBuffer = (AVAudioPCMBuffer *)buffer;
          if (pcmBuffer.frameLength == 0) {
            finished = YES;
            return;
          }

          if (!audioFile) {
            audioFile =
                [[AVAudioFile alloc]
                    initForWriting:[NSURL fileURLWithPath:outputPath]
                          settings:pcmBuffer.format.settings
                             error:&failure];
          }
          if (audioFile && !failure) {
            [audioFile writeFromBuffer:pcmBuffer error:&failure];
          }
          if (failure) {
            finished = YES;
          }
        }];

    while (!finished) {
      [[NSRunLoop currentRunLoop]
          runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }

    if (failure) {
      fprintf(
          stderr,
          "Speech rendering failed: %s\n",
          failure.localizedDescription.UTF8String
      );
      return 66;
    }
  }
  return 0;
}
