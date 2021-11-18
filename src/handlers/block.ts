import { TypeRegistry, Raw, Tuple } from "@polkadot/types";
import { hexToU8a } from "@polkadot/util";
import { blake2AsHex } from "@polkadot/util-crypto";
import { SubstrateBlock } from "@subql/types";
import { NodeEntity } from "../types/models/NodeEntity";

const registry = new TypeRegistry();

export class BlockHandler {
  private block: SubstrateBlock;

  private readonly peaks: [number, string][] = [
    [8388606, "fc94dd28d893d7628d0c7769d2cc0a51354944305cb522570f2bb67fb5b0d37b"],
    [10485757, "3dea9908a10d8e9cc807f93f65d55b4c7bf84d41c4dc0b4e70215332aeda483e"],
    [11010044, "084631199357bd0e8a6ca232c3f77e08cba4989581ded276c7187ee30e800dc6"],
    [11141115, "584727545a62ab4133e665568eea135d9e608b9dddb66acf909df68da0337030"],
    [11157498, "83d5b5e3e8bf0b8f3722405804bf1f1e9804d5c57e57f2ab16a9168754908707"],
    [11165689, "4fd1ccf85ee702013d531ac16543c6248978a350101e44ac08faa4866243bd57"],
    [11166712, "c1649e65ceccc480bdee0435e75d223b8e45dfac120ced18a04851fad7878737"],
    [11167223, "ce839cc950d99e2b298565acff0a3a5439726b8af402cf423c9db3a18f89e401"],
    [11167350, "95a6535b5b35a5b867c8abd4b8ec92019f28837ee1e4b797f32d00616d9c8f74"],
    [11167381, "ef627d767d4a39452fd64f71969c7968e115131477f24a362d6a3f5fae847753"],
    [11167388, "2b850ea017ae25191d373413a461aaeb51696cb1911244b15f7e83e43c17d30b"],
    [11167389, "01b0dc52eb1af94663d7a3ecd1b11ddf2fca75381e0457ab9fa31800b171db68"],
  ];

  private beginBlock = 5583701;

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
    record.hash = this.hash.substr(2);

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
    [new Raw(registry, hexToU8a("0x" + left)), new Raw(registry, hexToU8a("0x" + right))],
  );

  return blake2AsHex(res.toU8a()).slice(2);
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
