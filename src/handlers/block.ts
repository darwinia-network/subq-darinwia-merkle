import { TypeRegistry, Raw, Tuple } from "@polkadot/types";
import { hexToU8a } from "@polkadot/util";
import { blake2AsHex } from "@polkadot/util-crypto";
import { SubstrateBlock } from "@subql/types";
import { NodeEntity } from "../types/models/NodeEntity";

const registry = new TypeRegistry();

export class BlockHandler {
  private block: SubstrateBlock;

  // assert_eq!(get_peaks(leaf_index_to_mmr_size(4440000)), vec![8388606, 8650749, 8781820, 8847355, 8863738, 8871929, 8876024, 8878071, 8879094, 8879605, 8879860, 8879987, 8879988]);
  private readonly peaks: [number, string][] = [
    [8388606, "0xfc94dd28d893d7628d0c7769d2cc0a51354944305cb522570f2bb67fb5b0d37b"],
    [8650749, "0xb455faf965a951664448fe99f0ea45a648eb8de54e3316117118ccc9ce74ab28"],
    [8781820, "0x99d876fb6d5075d71eae37af3bc0fb5ef61778f165051a3fcab6a5280a503064"],
    [8847355, "0xe3fceb92b0a5873f70565c39521d50f1c8ceb4e6777e7b8566c9b188385c0a74"],
    [8863738, "0x3223d5c83f0ee5b8e8f0b5dddf67698a093eac85bff6b54825cdc29830b07998"],
    [8871929, "0x260449d7515136c7be2ef1a986ed11b0cc1d07d5197fa2042d82170c0555678f"],
    [8876024, "0x2d03c3e8ded5a20ca3f2a46fae604b08cec120320e8fb7842fdc3eabc28464b5"],
    [8878071, "0x671938886a0e29b696195fdaa96ad7b2fc6388fad7021676f2986d9edb4beaaf"],
    [8879094, "0x1a019c54adb3c54e3e05c697e50a2bbfe666c0e5ef4da41be93f3fcac79106d6"],
    [8879605, "0x24d5078f478594c5947660ee053cf84faf9cab1659f550283ab0981f92e7a11e"],
    [8879860, "0xc092063067166c75d9c547b86222844b5a8d0f06c1cbc747b5139b90aed8cd88"],
    [8879987, "0x04820a61e808323ab1ed36fbefe4f3ad0a691f7eb8ac40d85108c244c1f60ff9"],
    [8879988, "0x7b0bc8add08a714c68e59899ac630258caa0b511171b995d32ec83cbe1acb1a6"],
  ];

  // beginBlock should be last leaf_index + 1
  private beginBlock = 4440001;

  static async ensureNode(id: string): Promise<void> {
    const block = await NodeEntity.get(id);

    if (!block) {
      await new NodeEntity(id).save();
    }
  }

  constructor(block: SubstrateBlock) {
    this.block = block;
  }

  get number() {
    return this.block.block.header.number.toBigInt() || BigInt(0);
  }

  get hash() {
    return this.block.block.hash.toString();
  }

  public async save() {
    if (this.number < this.beginBlock) {
      return;
    }

    if (this.number === BigInt(this.beginBlock)) {
      this.init();
    }

    const block_position = leaf_index_to_pos(this.block.block.header.number.toNumber());
    const record = new NodeEntity(block_position.toString());

    record.position = block_position;
    record.hash = this.hash;

    await record.save();

    await this.checkPeaks(block_position);
  }

  private async checkPeaks(block_position: number) {
    let height = 0;
    let pos = block_position;

    while (pos_height_in_tree(pos + 1) > height) {
      pos += 1;

      const left_pos = pos - parent_offset(height);
      const right_pos = left_pos + sibling_offset(height);

      const left_elem = await NodeEntity.get(left_pos.toString());
      const right_elem = await NodeEntity.get(right_pos.toString());

      const record = new NodeEntity(pos.toString());

      record.position = pos;
      record.hash = merge(left_elem.hash, right_elem.hash);

      await record.save();

      height += 1;
    }
  }

  private async init() {
    const nodes = this.peaks.map(([pos, hash]) => {
      const record = new NodeEntity(pos.toString());
      
      record.position = pos;
      record.hash = hash;

      return record.save();
    });

    await Promise.all(nodes);
  }
}

/* ---------------------------------------helper fns-------------------------------------- */

// https://github.com/darwinia-network/darwinia-common/blob/dd290ffba475cf80bca06ac952fb2f29d3658560/frame/header-mmr/src/primitives.rs#L19-L21
function merge(left: string, right: string): string {
  const res = new Tuple(
    registry,
    [Raw, Raw],
    [new Raw(registry, hexToU8a(left)), new Raw(registry, hexToU8a(right))],
  );

  return blake2AsHex(res.toU8a());
}

function leaf_index_to_pos(index: number): number {
  // mmr_size - H - 1, H is the height(intervals) of last peak
  return leaf_index_to_mmr_size(index) - trailing_zeros(index + 1) - 1;
}

function leaf_index_to_mmr_size(index: number): number {
  // leaf index start with 0
  const leaves_count = index + 1;

  // the peak count(k) is actually the count of 1 in leaves count's binary representation
  const peak_count = count(leaves_count, "1");

  return 2 * leaves_count - peak_count;
}

function dec2bin(dec: number): string {
  return (dec >>> 0).toString(2).padStart(64, "0");
}

function count(dec: number, target: "0" | "1") {
  const binary = dec2bin(dec);
  let count: number = 0;

  for (let i = 0; i < binary.length; i++) {
    if (binary.charAt(i) === target) {
      count += 1;
    }
  }

  return count;
}

function trailing_zeros(dec: number): number {
  const binary = dec2bin(dec);
  let count: number = 0;

  for (let i = binary.length - 1; i >= 0; i--) {
    if (binary.charAt(i) === "0") {
      count += 1;
    } else {
      break;
    }
  }

  return count;
}

function leading_zeros(dec: number): number {
  const binary = dec2bin(dec);
  let count: number = 0;

  for (let i = 0; i < binary.length; i++) {
    if (binary.charAt(i) === "0") {
      count += 1;
    } else {
      break;
    }
  }

  return count;
}

function all_ones(dec: number): boolean {
  return dec != 0 && count(dec, "0") === leading_zeros(dec);
}

function jump_left(pos: number): number {
  const bit_length = 64 - leading_zeros(pos);
  const most_significant_bits = 1 << (bit_length - 1);

  return pos - (most_significant_bits - 1);
}

function pos_height_in_tree(pos: number): number {
  pos += 1;

  while (!all_ones(pos)) {
    pos = jump_left(pos);
  }

  return 64 - leading_zeros(pos) - 1;
}

function parent_offset(height: number): number {
  return 2 << height;
}

function sibling_offset(height: number): number {
  return (2 << height) - 1;
}
