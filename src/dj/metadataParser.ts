/**
 * Lightweight, zero-dependency embedded audio metadata extractor.
 * Parses ID3v2 (MP3), FLAC, and MP4/M4A metadata to extract embedded album cover art,
 * BPM tags (TBPM), Title (TIT2), and Artist (TPE1).
 */

export interface ExtractedMetadata {
  artworkUrl?: string;
  bpm?: number;
  title?: string;
  artist?: string;
}

function findHeader(bytes: Uint8Array, start: number, end: number): { offset: number; mime: string } | null {
  for (let i = start; i < end - 3; i++) {
    // JPEG: FF D8 FF
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      return { offset: i, mime: 'image/jpeg' };
    }
    // PNG: 89 50 4E 47
    if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x47) {
      return { offset: i, mime: 'image/png' };
    }
    // WEBP: RIFF .... WEBP
    if (bytes[i] === 0x52 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0x46 && bytes[i + 3] === 0x46) {
      if (i + 11 < end && bytes[i + 8] === 0x57 && bytes[i + 9] === 0x45 && bytes[i + 10] === 0x42 && bytes[i + 11] === 0x50) {
        return { offset: i, mime: 'image/webp' };
      }
    }
  }
  return null;
}

function decodeId3Text(bytes: Uint8Array, start: number, length: number): string {
  if (length <= 1) return '';
  const encoding = bytes[start]; // 0=ISO-8859-1, 1=UTF-16 with BOM, 2=UTF-16BE, 3=UTF-8
  const rawBytes = bytes.subarray(start + 1, start + length);
  try {
    let decoder: TextDecoder;
    if (encoding === 1 || encoding === 2) {
      decoder = new TextDecoder('utf-16');
    } else {
      decoder = new TextDecoder('utf-8');
    }
    return decoder.decode(rawBytes).replace(/\0.*$/g, '').trim();
  } catch (_) {
    let str = '';
    for (let i = 0; i < rawBytes.length; i++) {
      if (rawBytes[i] === 0) break;
      str += String.fromCharCode(rawBytes[i]);
    }
    return str.trim();
  }
}

export async function extractAudioMetadata(file: File): Promise<ExtractedMetadata> {
  const result: ExtractedMetadata = {};

  try {
    // Read up to first 6MB to locate embedded metadata tags
    const slice = file.slice(0, Math.min(file.size, 6 * 1024 * 1024));
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1. Locate ID3 header (MP3 at offset 0, or RIFF WAV id3 chunk)
    let id3Start = -1;
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      id3Start = 0;
    } else {
      // Check RIFF WAVE header or scan for 'id3 ' / 'ID3' within the header chunk
      for (let i = 0; i < Math.min(bytes.length - 10, 64 * 1024); i++) {
        if (bytes[i] === 0x49 && bytes[i + 1] === 0x44 && bytes[i + 2] === 0x33) { // "ID3"
          id3Start = i;
          break;
        }
      }
    }

    if (id3Start >= 0) {
      const version = bytes[id3Start + 3];
      const tagSize =
        ((bytes[id3Start + 6] & 0x7f) << 21) |
        ((bytes[id3Start + 7] & 0x7f) << 14) |
        ((bytes[id3Start + 8] & 0x7f) << 7) |
        (bytes[id3Start + 9] & 0x7f);

      let offset = id3Start + 10;
      const end = Math.min(bytes.length, id3Start + 10 + tagSize);

      while (offset + 10 < end) {
        let frameId = '';
        let frameSize = 0;
        let headerSize = 10;

        if (version === 2) {
          frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
          frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
          headerSize = 6;
        } else {
          frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
          if (version === 4) {
            frameSize =
              ((bytes[offset + 4] & 0x7f) << 21) |
              ((bytes[offset + 5] & 0x7f) << 14) |
              ((bytes[offset + 6] & 0x7f) << 7) |
              (bytes[offset + 7] & 0x7f);
          } else {
            frameSize =
              (bytes[offset + 4] << 24) |
              (bytes[offset + 5] << 16) |
              (bytes[offset + 6] << 8) |
              bytes[offset + 7];
          }
        }

        if (!frameId || frameSize <= 0 || offset + headerSize + frameSize > end) {
          break;
        }

        const frameDataStart = offset + headerSize;

        // Cover Art (APIC / PIC)
        if ((frameId === 'APIC' || frameId === 'PIC') && !result.artworkUrl) {
          const found = findHeader(bytes, frameDataStart, frameDataStart + frameSize);
          if (found) {
            const imgBytes = bytes.subarray(found.offset, frameDataStart + frameSize);
            const blob = new Blob([imgBytes], { type: found.mime });
            result.artworkUrl = URL.createObjectURL(blob);
          }
        }

        // BPM Frame (TBPM or TBP in v2.2)
        if ((frameId === 'TBPM' || frameId === 'TBP') && !result.bpm) {
          const bpmStr = decodeId3Text(bytes, frameDataStart, frameSize);
          const parsed = parseFloat(bpmStr);
          if (!isNaN(parsed) && parsed >= 50 && parsed <= 220) {
            result.bpm = Math.round(parsed * 10) / 10;
          }
        }

        // Title Frame (TIT2 or TT2 in v2.2)
        if ((frameId === 'TIT2' || frameId === 'TT2') && !result.title) {
          const titleStr = decodeId3Text(bytes, frameDataStart, frameSize);
          if (titleStr) result.title = titleStr;
        }

        // Artist Frame (TPE1 or TP1 in v2.2)
        if ((frameId === 'TPE1' || frameId === 'TP1') && !result.artist) {
          const artistStr = decodeId3Text(bytes, frameDataStart, frameSize);
          if (artistStr) result.artist = artistStr;
        }

        offset += headerSize + frameSize;
      }
    }

    // 2. FLAC Vorbis Picture Block
    if (!result.artworkUrl && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) { // "fLaC"
      let offset = 4;
      while (offset + 4 < bytes.length) {
        const isLast = (bytes[offset] & 0x80) !== 0;
        const blockType = bytes[offset] & 0x7f;
        const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        offset += 4;

        if (blockType === 6) { // PICTURE
          const found = findHeader(bytes, offset, offset + length);
          if (found) {
            const imgBytes = bytes.subarray(found.offset, offset + length);
            const blob = new Blob([imgBytes], { type: found.mime });
            result.artworkUrl = URL.createObjectURL(blob);
            break;
          }
        }

        offset += length;
        if (isLast) break;
      }
    }

    // 3. MP4 / M4A (Search for 'covr' box)
    if (!result.artworkUrl) {
      for (let i = 0; i < Math.min(bytes.length - 8, 500000); i++) {
        if (bytes[i] === 0x63 && bytes[i + 1] === 0x6f && bytes[i + 2] === 0x76 && bytes[i + 3] === 0x72) { // "covr"
          const found = findHeader(bytes, i + 4, Math.min(bytes.length, i + 1000000));
          if (found) {
            const imgBytes = bytes.subarray(found.offset);
            const blob = new Blob([imgBytes], { type: found.mime });
            result.artworkUrl = URL.createObjectURL(blob);
            break;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Audio metadata parsing error:', e);
  }

  return result;
}

export async function extractAudioArtwork(file: File): Promise<string | undefined> {
  const meta = await extractAudioMetadata(file);
  return meta.artworkUrl;
}
