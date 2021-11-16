import {SubstrateBlock} from "@subql/types";
import {NodeEntity} from "../types";


export async function handleBlock(block: SubstrateBlock): Promise<void> {
    //Create a new starterEntity with ID using block hash
    let record = new NodeEntity(block.block.header.hash.toString());
    //Record block number
    record.position = block.block.header.number.toNumber();
    record.hash = block.block.header.hash.toString();
    await record.save();
}


