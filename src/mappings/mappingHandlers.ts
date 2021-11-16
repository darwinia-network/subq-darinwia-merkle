import {SubstrateBlock} from "@subql/types";
import {NodeEntity} from "../types";


export async function handleBlock(block: SubstrateBlock): Promise<void> {
    let block_number = block.block.header.number.toNumber();
    let block_hash = block.block.header.hash.toString();

    if (block_number === 5583701) {
        // https://github.com/darwinia-network/wormhole-ui/issues/189
        var peaks: [number, string][]
        peaks  = [
            [8388606, "0xfc94dd28d893d7628d0c7769d2cc0a51354944305cb522570f2bb67fb5b0d37b"],
            [10485757, "0x3dea9908a10d8e9cc807f93f65d55b4c7bf84d41c4dc0b4e70215332aeda483e"],
            [11010044, "0x084631199357bd0e8a6ca232c3f77e08cba4989581ded276c7187ee30e800dc6"],
            [11141115, "0x584727545a62ab4133e665568eea135d9e608b9dddb66acf909df68da0337030"],
            [11157498, "0x83d5b5e3e8bf0b8f3722405804bf1f1e9804d5c57e57f2ab16a9168754908707"],
            [11165689, "0x4fd1ccf85ee702013d531ac16543c6248978a350101e44ac08faa4866243bd57"],
            [11166712, "0xc1649e65ceccc480bdee0435e75d223b8e45dfac120ced18a04851fad7878737"],
            [11167350, "0x95a6535b5b35a5b867c8abd4b8ec92019f28837ee1e4b797f32d00616d9c8f74"],
            [11167381, "0xef627d767d4a39452fd64f71969c7968e115131477f24a362d6a3f5fae847753"],
            [11167388, "0x2b850ea017ae25191d373413a461aaeb51696cb1911244b15f7e83e43c17d30b"],
            [11167389, "0x01b0dc52eb1af94663d7a3ecd1b11ddf2fca75381e0457ab9fa31800b171db68"]
        ];
        for (var node of peaks) {
            let record = new NodeEntity(node[0].toString());
            record.position = node[0];
            record.hash = node[1];
            await record.save();
        }
    }

    // Append block number on new block and derived nodes
    // https://github.com/darwinia-network/merkle-mountain-range/blob/b16216f90e3ff143114a9966330b8b42c33a28c5/src/mmr.rs#L51-L74
    // const node = await NodeEntity.get(id);
    let block_position = leaf_index_to_pos(block_number);
    let record = new NodeEntity(block_position.toString());
    record.position = block_position;
    record.hash = block_hash;
    await record.save();

    let height = 0;
    let pos = block_position;
    while (pos_height_in_tree(pos + 1) > height) {
        pos += 1;
        let left_pos = pos - parent_offset(height);
        let right_pos = left_pos + sibling_offset(height);

        let left_elem = await NodeEntity.get(left_pos.toString());
        let right_elem = await NodeEntity.get(right_pos.toString());

        let record = new NodeEntity(pos.toString());
        record.position = pos;
        // let parent_elem = M::merge(&left_elem, &right_elem);
        record.hash = merge(left_elem.hash, right_elem.hash);
        await record.save();

        height += 1
    }
}

// https://github.com/darwinia-network/darwinia-common/blob/dd290ffba475cf80bca06ac952fb2f29d3658560/frame/header-mmr/src/primitives.rs#L19-L21
function merge(left: string, right: string) : string {
    return ""
}

function leaf_index_to_pos(index: number) : number {
    // mmr_size - H - 1, H is the height(intervals) of last peak
    return leaf_index_to_mmr_size(index) - trailing_zeros(index + 1)  - 1;
}

function leaf_index_to_mmr_size(index: number) : number {
    // leaf index start with 0
    let leaves_count = index + 1;

    // the peak count(k) is actually the count of 1 in leaves count's binary representation
    let peak_count = count_ones(leaves_count);

    return 2 * leaves_count - peak_count;
}

function dec2bin(dec: number) : string {
    return (dec >>> 0).toString(2);
}

function trailing_zeros(dec: number) : number {
    let count : number = 0;
    let binary = dec2bin(dec);
    for (let i = binary.length - 1; i >=0; i--) {
        if (binary.charAt(i) === '0') {
            count += 1;
        } else {
            break;
        }
    }

    return count;
}

function leading_zeros(dec: number) : number {
    let count : number = 0;
    let binary = dec2bin(dec);
    for (let i = 0; i < binary.length; i++) {
        if (binary.charAt(i) === '0') {
            count += 1;
        } else {
            break;
        }
    }

    return count;
}

function count_ones(dec: number) : number {
    let count : number = 0;
    let binary = dec2bin(dec);
    for (let i = 0; i < binary.length; i++) {
        if (binary.charAt(i) === '1') {
            count += 1;
        }
    }

    return count;
}

function all_ones(dec: number) : boolean {
    let count : number = 0;
    let binary = dec2bin(dec);
    for (let i = 0; i < binary.length; i++) {
        if (binary.charAt(i) === '0') {
           return false;
        }
    }

    return true;
}

function jump_left(pos: number) : number {
    let bit_length = 64 - leading_zeros(pos);
    let most_significant_bits = 1 << (bit_length - 1);
    return pos - (most_significant_bits - 1);
}


function pos_height_in_tree(pos: number) : number {
    pos += 1;

    while (!all_ones(pos)) {
        pos = jump_left(pos);
    }

    return 64 - leading_zeros(pos) - 1;
}

function parent_offset(height: number) : number {
    return 2 << height;
}

function sibling_offset(height: number) : number {
    return (2 << height) - 1;
}


