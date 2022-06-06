// [bonus] unit test for bonus.circom
const chai = require("chai");
const path = require("path");
const { buildPoseidon } = require('circomlibjs');
const { IncrementalMerkleTree } = require('@zk-kit/incremental-merkle-tree');

const wasm_tester = require("circom_tester").wasm;

const F1Field = require("ffjavascript").F1Field;
const Scalar = require("ffjavascript").Scalar;
exports.p = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const Fr = new F1Field(exports.p);

const assert = chai.assert;

describe("Public circuit tests", function () {
    this.timeout(100000000);

    it("Shoud correctly create proof for validating that the item belongs in transaction", async () => {
        const circuit = await wasm_tester(path.join(__dirname, "../", "circuits", "public-validation.circom"));
        await circuit.loadConstraints();

        // Initialize transaction tree
        const poseidon = await buildPoseidon();
        const zeroValue = 0;
        const depth = 20;
        const arity = 2;
        const tree = new IncrementalMerkleTree((inputs) => { return BigInt(poseidon.F.toString(poseidon(inputs)), 'hex') }, depth, zeroValue, arity);

        const createLeaf = (itemId, unitCode, itemQuantity) => {
            const itemIdHash = BigInt(
                poseidon.F.toString(
                    poseidon(
                        [
                            BigInt(
                                Buffer.from(itemId, 'utf-8').toString('hex'), 
                                'hex'
                            )
                        ]
                    )
                ), 
                'hex'
            );
            return { itemIdHash, leaf: BigInt(poseidon.F.toString((poseidon([itemIdHash, unitCode, itemQuantity]))), 'hex') };
        }

        const itemIds = ['A','B','C'];
        const itemQuantities = [100, 121, 45555];
        const leaves = [];
        const itemIdHashes = [];

        for (let i = 0; i < 3; i += 1) {
            const itemId = itemIds[i];
            const itemQuantity = itemQuantities[i];
            const { itemIdHash, leaf } = createLeaf(itemId, 1, itemQuantity);

            tree.insert(leaf);
            leaves.push(leaf);
            itemIdHashes.push(itemIdHash);
        }

        const leafIndex = 2;

        const transactionDate = 1654536254;
        const transactionId = 'TX1';
        const transactionIdHash = BigInt(
            poseidon.F.toString(
                poseidon(
                    [
                        BigInt(
                            Buffer.from(transactionId, 'utf-8').toString('hex'), 
                            'hex'
                        )
                    ]
                )
            ), 
            'hex'
        );

        const transactionHash = poseidon.F.toString((poseidon([transactionIdHash, transactionDate, tree.root])));
        const proof = tree.createProof(leafIndex);

        const INPUT = {
            // Private inputs
            unitCode: `${1}`,
            itemQuantity: `${itemQuantities[leafIndex]}`,
            path_elements: proof.siblings.map(arr => arr[0].toString()),
            path_index: proof.pathIndices.map(el => `${el}`),

            // Public inputs
            itemIdHash: itemIdHashes[leafIndex].toString(),
            transactionDate: `${transactionDate}`,
            transactionIdHash: transactionIdHash.toString(),
            transactionHash,
        }

        const witness = await circuit.calculateWitness(INPUT, true);
        assert(Fr.eq(Fr.e(witness[0]),Fr.e(1)));
    });
});