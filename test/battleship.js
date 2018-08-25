const Battleship = artifacts.require("Battleship");
const BattleshipTest = artifacts.require("BattleshipTest");
const catchRevert = require("./exceptions.js").catchRevert;

const GAMESTATE_CREATED = 0;
const GAMESTATE_PLAYERSJOINED = 1;
const GAMESTATE_STARTED = 2;
const GAMESTATE_FINISHED = 3;
const GAMESTATE_SHIPSREVEALED = 4;
const GAMESTATE_ENDED = 5;

const GameEndState_Unknown = 0;
const GameEndState_Draw = 1;
const GameEndState_Player1WinsValidGame = 2;
const GameEndState_Player2WinsValidGame = 3; 
const GameEndState_Player1WinsInvalidGame = 4;
const GameEndState_Player2WinsInvalidGame = 5;

const emptyAddress = '0x0000000000000000000000000000000000000000';
const testNonce = '0x1234000000000000000000000000000000000000';

const assumptionsReminder = '(assumes boardShips = [5,4,3,3,2] and boardWidth = boardHeight = 10)';

function convertNumberToMoveResult(moveResultNumber) {
    let moveResultEnum = ['Unknown', 'Miss', 'Hit'];
    return moveResultEnum[moveResultNumber];
}

function convertMoveResultToNumber(moveResult) {
    let moveResultEnum = {'Unknown': 0, 'Miss': 1, 'Hit': 2};
    return moveResultEnum[moveResult];
};


contract('Game startup', async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let contract;

    // https://ethereum.stackexchange.com/questions/15670/deploying-a-contract-at-test-time-with-truffle
    // https://ethereum.stackexchange.com/questions/15567/truffle-smart-contract-testing-does-not-reset-state/15574#15574
    beforeEach(async () => {
        contract = await Battleship.new(0)
     });

    it("should be able add players", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        assert.equal(await instance.player1(), alice, "player 1 should match");
        assert.equal(await instance.player2(), bob, "player 2 should match");

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");
    });

    it("state should change accordingly", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinGameForPlayer(alice);
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should still be CREATED");

        await instance.joinGameForPlayer(bob);
        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");
    });

    it("should not be able add two same players", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        instance.joinGameForPlayer(alice);
        await catchRevert(instance.joinGameForPlayer(alice));
    });

    it("should not be able add three players", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);
        await catchRevert(instance.joinGameForPlayer(carol));
    });
});

contract('Game add (hidden) ships', async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let contract;
    let boardShips;

    beforeEach(async () => {
        let instance = await Battleship.new(0);
        boardShips = await instance.getBoardShips();
        contract = instance;
    });

    it("should be able add ships with only one player", async () => {
        let instance = contract;
        await instance.joinGameForPlayer(alice);

        let shipNumber = 0; // test the smallest possible ship number
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});

        let hiddenShips = await instance.getHiddenShipsPackedForPlayer(alice);
        assert.equal(hiddenShips[shipNumber], commitHash, "ship should be in list");

        shipNumber = boardShips.length - 1; // test the largest possible ship number
        shipWidth = boardShips[shipNumber];
        commitHash = await instance.calculateCommitHash(shipWidth, 1, 2, 2, testNonce);
        await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});

        hiddenShips = await instance.getHiddenShipsPackedForPlayer(alice);
        assert.equal(hiddenShips[shipNumber], commitHash, "ship should be in list");
    });

    it("should be able add ships with two players", async () => {
        let instance = contract;
        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        let shipNumber = 0;
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});

        let hiddenShips = await instance.getHiddenShipsPackedForPlayer(alice);
        assert.equal(hiddenShips[shipNumber], commitHash, "alice ship should be in list");

        await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
        hiddenShips = await instance.getHiddenShipsPackedForPlayer(bob);
        assert.equal(hiddenShips[shipNumber], commitHash, "bob ship should be in list");
    });

    it("should not be able add ships if not a player", async () => {
        let instance = contract;
        let shipNumber = 0;
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        await catchRevert(instance.submitHiddenShip(shipNumber, commitHash, {from: carol}));
    });

    it("should not be able add ships outside of number of ships allowed", async () => {
        let instance = contract;
        let shipNumber = 0;
        let invalidShipNumber;
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        invalidShipNumber = boardShips.length;
        await catchRevert(instance.submitHiddenShip(invalidShipNumber, commitHash, {from: alice}));
        invalidShipNumber = -1;
        await catchRevert(instance.submitHiddenShip(invalidShipNumber, commitHash, {from: alice}));
    });

});

contract('Game check ships have been placed', async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let contract;
    let boardShips;

    beforeEach(async () => {
        let instance = await Battleship.new(0);
        boardShips = await instance.getBoardShips();

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        contract = instance;
    });

    it("should change state once both players have placed ships", async () => {
        let instance = contract;

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");
        
        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});
        }

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
        }

        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");
    });

    it("should not be able to make shots until ships have been placed", async () => {
        let instance = contract;

        await catchRevert(instance.makeMove(0, 0, {from: alice}));

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});
        }

        await catchRevert(instance.makeMove(0, 0, {from: alice}));

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
        }

        await instance.makeMove(0, 0, {from: alice});
        assert.equal(await instance.getPlayerMovesCount(alice), 1, "move should be successful after adding ships")
    });

});

contract('Game make shots ' + assumptionsReminder, async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let contract;
    let boardShips;

    beforeEach(async () => {
        let instance = await Battleship.new(0);
        boardShips = await instance.getBoardShips();

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});
        }

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
        }

        contract = instance;
    });

    // We don't check that you cannot make move at the same position as previously
    // This is because this is allowed by the code! But as a player, why would you want to do that?

    it("should not be able to make shots if not a player", async () => {
        let instance = contract;
        await catchRevert(instance.makeMove(0, 0, {from: carol}));
    });

    it("player 1 should be able to make first shot", async () => {
        let instance = contract;
        await instance.makeMove(0, 0, {from: alice});
        assert.equal(await instance.getPlayerMovesCount(alice), 1, "move should be successful")
    });

    it("player 2 should not be able to make first shot", async () => {
        let instance = contract;
        await catchRevert(instance.makeMove(0, 0, {from: bob}));
    });

    it("player 1 should not be able to make two shots consecutively (first shot case)", async () => {
        let instance = contract;
        await instance.makeMove(0, 0, {from: alice});
        await catchRevert(instance.makeMove(0, 1, {from: alice}));
    });

    it("player 1 should not be able to make two shots consecutively (subsequent shot case)", async () => {
        let instance = contract;
        await instance.makeMove(0, 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 0, convertMoveResultToNumber('Miss'), 1, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 1, convertMoveResultToNumber('Miss'), 1, {from: alice});
        await catchRevert(instance.makeMoveAndUpdateLastMoveWithResult(0, 2, convertMoveResultToNumber('Miss'), 1, {from: alice}));
    });

    it("player 2 should not be able to make two shots consecutively (first shot case)", async () => {
        let instance = contract;
        await instance.makeMove(0, 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 0, convertMoveResultToNumber('Miss'), 1, {from: bob})
        await catchRevert(instance.makeMoveAndUpdateLastMoveWithResult(0, 1, convertMoveResultToNumber('Miss'), 1, {from: bob}));
    });

    it("player 2 should not be able to make two shots consecutively (subsequent shot case)", async () => {
        let instance = contract;
        await instance.makeMove(0, 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 0, convertMoveResultToNumber('Miss'), 1, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 1, convertMoveResultToNumber('Miss'), 1, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 1, convertMoveResultToNumber('Miss'), 1, {from: bob});
        await catchRevert(instance.makeMoveAndUpdateLastMoveWithResult(0, 2, convertMoveResultToNumber('Miss'), 1, {from: bob}));
    });

    it("should not be able to make move without updating result of opponent's previous shot", async () => {
        let instance = contract;
        await instance.makeMove(0, 0, {from: alice});
        await catchRevert(instance.makeMove(0, 0, {from: bob}));
    });
});

contract('Game test batch add ships and batch move test functions', async(accounts) => {

    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let contract;
    let boardShips;

    let timestamp = 1535187520; 

    let formatMoves = function(movesPacked) {
        let x = movesPacked[0];
        let y = movesPacked[1];
        let result = movesPacked[2];
        let shipNumber = movesPacked[3];

        let moves = [];
        for (let i = 0; i < x.length; i++) {
            moves.push({
                x: x[i].toNumber(),
                y: y[i].toNumber(),
                result: result[i].toNumber(),
                shipNumber: shipNumber[i].toNumber()
            })
        }

        return moves;
    }

    it ('batch ship add and move should match normal ship add and move', async() => {
        let instance = await BattleshipTest.new(0, timestamp);
        await instance.setTestMode(); // enable testMode
        boardShips = await instance.getBoardShips();
        var maxShipLength = boardShips.reduce(function(a, b) {
            return Math.max(a, b);
        });

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        // Sets up ships like the following
        // 5 5 5 5 5
        // 4 4 4 4
        // 3 3 3
        // 3 3 3
        // 2 2
        
        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});
            await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
        }

        // Play until all the ships have been hit except last ship (boardShips.length - 1 to exclude last row)
        for (let y = 0; y < boardShips.length - 1; y++) {
            // maxShipLength + 1 to make it easier to calculate stuff (don't have to handle wrapping)
            for (let x = 0; x < maxShipLength + 1; x++) {
                if (y == 0 && x == 0) { // first move
                    //console.log("alice", x, y);
                    await instance.makeMove(x, y, {from: alice});
                } else if (x > 0 && x <= boardShips[y]) { // if ship is length 5, x = 1 .. 5 is when opponent put x = 0 .. 4 which is hit
                    //console.log("alice", x, y, 'Hit', y);
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Hit'), y, {from: alice}); 
                } else {
                    //console.log("alice", x, y, 'Miss', 0);
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Miss'), 0, {from: alice}); 
                }

                //console.log("bob", x, y);
                if (x <= boardShips[y] - 1) { // if ship is length 5, x = 0 .. 4 is hit
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Hit'), y, {from: bob}); 
                } else {
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Miss'), 0, {from: bob}); 
                }
            }
        }

        let normalAliceMoves = formatMoves(await instance.getPlayerMovesPacked(alice));
        let normalBobMoves = formatMoves(await instance.getPlayerMovesPacked(bob));
        //console.log(normalAliceMoves);
        //console.log(normalBobMoves);

        // Try all the batch features
        let instanceBatch = await BattleshipTest.new(0, timestamp);
        await instanceBatch.setTestMode(); // enable testMode
        boardShips = await instanceBatch.getBoardShips();
        var maxShipLength = boardShips.reduce(function(a, b) {
            return Math.max(a, b);
        });

        await instanceBatch.joinGameForPlayer(alice);
        await instanceBatch.joinGameForPlayer(bob);

        // Sets up ships like the following
        // 5 5 5 5 5
        // 4 4 4 4
        // 3 3 3
        // 3 3 3
        // 2 2

        let commitHashes = [];
        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instanceBatch.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            commitHashes.push(commitHash);
        }
        await instanceBatch.submitHiddenShipsPacked(commitHashes, {from: alice});
        await instanceBatch.submitHiddenShipsPacked(commitHashes, {from: bob});

        assert.deepEqual(await instanceBatch.getHiddenShipsPackedForPlayer(alice), await instance.getHiddenShipsPackedForPlayer(alice), "Packed ships should be the same");
        assert.deepEqual(await instanceBatch.getHiddenShipsPackedForPlayer(bob), await instance.getHiddenShipsPackedForPlayer(bob), "Packed ships should be the same");
    

        let moves = [];
        // Play until all the ships have been hit except last ship (boardShips.length - 1 to exclude last row)
        for (let y = 0; y < boardShips.length - 1; y++) {
            // maxShipLength + 1 to make it easier to calculate stuff (don't have to handle wrapping)
            for (let x = 0; x < maxShipLength + 1; x++) {
                let moveResult = convertMoveResultToNumber('Miss');
                let shipNumber = 0;
                if (x < boardShips[y]) {
                    moveResult = convertMoveResultToNumber('Hit');
                    shipNumber = y;
                }

                // Push alice move
                moves.push({x: x, y: y, result: moveResult, shipNumber: shipNumber});
                // Push bob's move
                moves.push({x: x, y: y, result: moveResult, shipNumber: shipNumber});
            }
        }
        // we manually fix the last move as it should be unknown status
        moves[moves.length - 1].result = convertMoveResultToNumber('Unknown');
        moves[moves.length - 1].shipNumber = 0;

        let movesX = [];
        let movesY = [];
        let movesResult = [];
        let movesShipNumber = [];
        for (let i = 0; i < moves.length; i++) {
            movesX.push(moves[i].x);
            movesY.push(moves[i].y);
            movesResult.push(moves[i].result);
            movesShipNumber.push(moves[i].shipNumber);
        }
        //console.log(movesX, movesY, movesResult, movesShipNumber);
        await instanceBatch.batchMakeMove(movesX, movesY, movesResult, movesShipNumber);

        let batchAliceMoves = formatMoves(await instanceBatch.getPlayerMovesPacked(alice));
        let batchBobMoves = formatMoves(await instanceBatch.getPlayerMovesPacked(bob));
        //console.log(batchAliceMoves);
        //console.log(batchBobMoves);

        for(let i = 0; i < 100; i++) {
            //console.log(i, "Alice", JSON.stringify(normalAliceMoves[i]) == JSON.stringify(batchAliceMoves[i]), normalAliceMoves[i], batchAliceMoves[i]);
            //console.log(i, "Bob", JSON.stringify(normalBobMoves[i]) == JSON.stringify(batchBobMoves[i]), normalBobMoves[i], batchBobMoves[i]);
            assert.deepEqual(normalAliceMoves[i], batchAliceMoves[i], "Alice move number (0-indexed) " + i + " should be equal");
            assert.deepEqual(normalBobMoves[i], batchBobMoves[i], "Bob move number (0-indexed) " + i + " should be equal");
        }
    });
});

contract('Game endings - timeouts', async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let contract;
    let boardShips;

    let timestamp = 1535187520; 

    beforeEach(async () => {
        let instance = await BattleshipTest.new(0, timestamp);
        boardShips = await instance.getBoardShips();
        contract = instance;
     });

    it("should not be allowed to end game before waiting 24 hours for 2nd player", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinGameForPlayer(alice);

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});        
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should still be CREATED");

        await instance.setTimestamp(await instance.createdAt() + 24 * 60 * 60 + 30);

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});
        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        assert.equal(await instance.gameEndState(), GameEndState_Draw, "game is a draw, it hasn't started yet");
    });

    it("should not be allowed to end game before waiting 24 hours ships to be submitted", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");

        // Submit some ships
        let commitHashes = [];
        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            commitHashes.push(commitHash);
            
        }
        await instance.submitHiddenShipsPacked(commitHashes, {from: alice});
        
        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});
        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should still be PLAYERSJOINED");

        await instance.setTimestamp(await instance.createdAt() + 24 * 60 * 60 + 30);

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});
        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        assert.equal(await instance.gameEndState(), GameEndState_Draw, "game is a draw, it hasn't started yet");
    });

    it("should not be allowed to end game before waiting 24 hours since game started", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");

        // Submit some ships
        let commitHashes = [];
        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            commitHashes.push(commitHash);
        }
        await instance.submitHiddenShipsPacked(commitHashes, {from: alice});
        await instance.submitHiddenShipsPacked(commitHashes, {from: bob});

        assert.equal((await instance.gameState()).toNumber(), GAMESTATE_STARTED, "game state should be STARTED");

        // Make some move
        await instance.makeMove(0, 0, {from: alice});

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});
        assert.equal((await instance.gameState()).toNumber(), GAMESTATE_STARTED, "game state should still be STARTED");

        await instance.setTimestamp(await instance.createdAt() + 24 * 60 * 60 + 30);

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});
        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        assert.equal(await instance.gameEndState(), GameEndState_Draw, "game is a draw, it hasn't started yet");
    });
});

contract('Game endings ' + assumptionsReminder, async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let contract;
    let boardShips;
    let ships = [];

    let timestamp = 1535187520; 

    let getShipsPackedForm = function(ships) {
        let packedShips = {width: [], height: [], x: [], y: [], nonce: []};
        for (let i = 0; i < ships.length; i++) {
            packedShips.width.push(ships[i].width);
            packedShips.height.push(ships[i].height);
            packedShips.x.push(ships[i].x);
            packedShips.y.push(ships[i].y);
            packedShips.nonce.push(ships[i].nonce);
        }

        return packedShips;
    }

    beforeEach(async () => {

        let instanceBatch = await BattleshipTest.new(0, timestamp);
        await instanceBatch.setTestMode(); // enable testMode
        boardShips = await instanceBatch.getBoardShips();
        var maxShipLength = boardShips.reduce(function(a, b) {
            return Math.max(a, b);
        });

        await instanceBatch.joinGameForPlayer(alice);
        await instanceBatch.joinGameForPlayer(bob);

        // Sets up ships like the following
        // 5 5 5 5 5
        // 4 4 4 4
        // 3 3 3
        // 3 3 3
        // 2 2

        let commitHashes = [];
        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            ships.push({width: shipWidth, height: 1, x: 0, y: shipNumber, nonce: testNonce});
            let commitHash = await instanceBatch.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            commitHashes.push(commitHash);
            
        }
        await instanceBatch.submitHiddenShipsPacked(commitHashes, {from: alice});
        await instanceBatch.submitHiddenShipsPacked(commitHashes, {from: bob});

        let moves = [];
        // Play until all the ships have been hit except last ship (boardShips.length - 1 to exclude last row)
        for (let y = 0; y < boardShips.length - 1; y++) {
            // maxShipLength + 1 to make it easier to calculate stuff (don't have to handle wrapping)
            for (let x = 0; x < maxShipLength + 1; x++) {
                let moveResult = convertMoveResultToNumber('Miss');
                let shipNumber = 0;
                if (x < boardShips[y]) {
                    moveResult = convertMoveResultToNumber('Hit');
                    shipNumber = y;
                }

                // Push alice move
                moves.push({x: x, y: y, result: moveResult, shipNumber: shipNumber});
                // Push bob's move
                moves.push({x: x, y: y, result: moveResult, shipNumber: shipNumber});
            }
        }
        // we manually fix the last move as it should be unknown status
        moves[moves.length - 1].result = convertMoveResultToNumber('Unknown');
        moves[moves.length - 1].shipNumber = 0;

        let movesX = [];
        let movesY = [];
        let movesResult = [];
        let movesShipNumber = [];
        for (let i = 0; i < moves.length; i++) {
            movesX.push(moves[i].x);
            movesY.push(moves[i].y);
            movesResult.push(moves[i].result);
            movesShipNumber.push(moves[i].shipNumber);
        }
        //console.log(movesX, movesY, movesResult, movesShipNumber);
        await instanceBatch.batchMakeMove(movesX, movesY, movesResult, movesShipNumber);

        contract = instanceBatch;
    });

    it("should determine winner correctly (player 1 wins)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Declare game finished
        await instance.tryToDeclareGameFinished({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED");

        // Both players reveal their ships
        let shipsPacked = getShipsPackedForm(ships);
        //console.log(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce']);
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: alice});
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_SHIPSREVEALED, "game state should be SHIPSREVEALED");

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        let endState = await instance.gameEndState();
        assert.equal(endState.toNumber(), GameEndState_Player1WinsValidGame, "alice wins because she sunk all the ships first");
        
    });

    it("should determine winner correctly (player 2 wins)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(5, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 0, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(6, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Miss'), 0, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(7, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
       
        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Declare game finished
        await instance.tryToDeclareGameFinished({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED");

        // Both players reveal their ships
        let shipsPacked = getShipsPackedForm(ships);
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: alice});
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_SHIPSREVEALED, "game state should be SHIPSREVEALED");

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        let endState = await instance.gameEndState();
        assert.equal(endState.toNumber(), GameEndState_Player2WinsValidGame, "bob wins because he sunk all the ships first");
    });

    it("should detect wrongly reported moves (player 1)", async () => {
        let instance = contract;

        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Miss'), 4, {from: alice}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
       
        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Declare game finished
        await instance.tryToDeclareGameFinished({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED");

        // Both players reveal their ships
        let shipsPacked = getShipsPackedForm(ships);
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: alice});
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_SHIPSREVEALED, "game state should be SHIPSREVEALED");

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        let endState = await instance.gameEndState();
        assert.equal(endState.toNumber(), GameEndState_Player2WinsInvalidGame, "bob wins - alice has misreported");
    });

    it("should detect wrongly reported moves (player 2)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(5, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 0, {from: bob}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResult(6, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Miss'), 0, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(7, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
       
        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Declare game finished
        await instance.tryToDeclareGameFinished({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED");

        // Both players reveal their ships
        let shipsPacked = getShipsPackedForm(ships);
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: alice});
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_SHIPSREVEALED, "game state should be SHIPSREVEALED");

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        let endState = await instance.gameEndState();
        assert.equal(endState.toNumber(), GameEndState_Player1WinsInvalidGame, "alice wins because, even though bob sunk all the ships first, bob has misreported");
    });

    it("should detect wrongly reported moves (both)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(5, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResult(6, 4, convertMoveResultToNumber('Miss'), 0, {from: alice}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(7, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
       
        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Declare game finished
        await instance.tryToDeclareGameFinished({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED");

        // Both players reveal their ships
        let shipsPacked = getShipsPackedForm(ships);
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: alice});
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_SHIPSREVEALED, "game state should be SHIPSREVEALED");

        await instance.tryToDeclareGameTimeoutOrEnded({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        let endState = await instance.gameEndState();
        assert.equal(endState.toNumber(), GameEndState_Draw, "draw because both players mis-reported");
    });

    it("should not allow declare game finished if not enough hits", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Try to declare game finished
        await catchRevert(instance.tryToDeclareGameFinished({from: alice}));
    });

    it("both players don't reveal ships 24 hours after finished, allow the game to end", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Declare game finished
        //console.log("Try to declare game finished");
        await instance.tryToDeclareGameFinished({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED");

        //console.log("Try to declare game timeout 1", await instance.createdAt(), await instance.startedAt(), await instance.finishedAt());
        await instance.tryToDeclareGameTimeoutOrEnded({from: bob});

        // State should not have moved
        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED 2");

        // Advance time forward
        await instance.setTimestamp(await instance.finishedAt() + 24 * 60 * 60 + 30);

        //console.log("Try to declare game timeout 2");
        await instance.tryToDeclareGameTimeoutOrEnded({from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        let endState = await instance.gameEndState();
        assert.equal(endState.toNumber(), GameEndState_Draw, "draw because both players did not reveal ships");
        
    });

    it("should not allow declare game ended if both players not yet revealed ships or timeout", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_STARTED, "game state should be STARTED");

        // Declare game finished
        //console.log("Try to declare game finished");
        await instance.tryToDeclareGameFinished({from: alice});

        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED");

        //console.log("Try to declare game timeout 1", await instance.createdAt(), await instance.startedAt(), await instance.finishedAt());
        await instance.tryToDeclareGameTimeoutOrEnded({from: bob});

        // State should not have moved
        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED 2");

        // Only bob reveal ships
        let shipsPacked = getShipsPackedForm(ships);
        await instance.revealShipsPacked(shipsPacked['width'], shipsPacked['height'], shipsPacked['x'], shipsPacked['y'], shipsPacked['nonce'], {from: bob});
        
        // State should not have moved
        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED 3");

        //console.log("Try to declare game timeout 2");
        await instance.tryToDeclareGameTimeoutOrEnded({from: bob});

        // State should not have moved
        assert.equal(await instance.gameState(), GAMESTATE_FINISHED, "game state should be FINISHED 4");

        await instance.setTimestamp(await instance.finishedAt() + 24 * 60 * 60 + 30);

        //console.log("Try to declare game timeout 3");
        await instance.tryToDeclareGameTimeoutOrEnded({from: bob});

        assert.equal(await instance.gameState(), GAMESTATE_ENDED, "game state should be ENDED");

        let endState = await instance.gameEndState();
        assert.equal(endState.toNumber(), GameEndState_Player2WinsInvalidGame, "bob wins because alice did not reveal ships in time limit");
        
    });
});

contract('Game detects invalid ship placements ' + assumptionsReminder, async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let boardShips;

    it("should not allow overlapping ships", async () => {

        let instance = await Battleship.new(0);
        boardShips = await instance.getBoardShips();
        var maxShipLength = boardShips.reduce(function(a, b) {
            return Math.max(a, b);
        });

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        // Sets up ships like the following
        // 5 5 5 5 5
        // 4 4 4 4
        // 3 3 3
        // 3/2 3/2 3

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other (except last ship, we make it overlap the previous ship)
            let shipY = shipNumber;
            if (shipNumber == boardShips.length - 1) {
                shipY = shipNumber - 1;
            }
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipY, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});
            await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
        }

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            let shipY = shipNumber;
            if (shipNumber == boardShips.length - 1) {
                shipY = shipNumber - 1;
            }
            await instance.revealShip(shipNumber, shipWidth, 1, 0, shipY, testNonce, {from: alice});
            await instance.revealShip(shipNumber, shipWidth, 1, 0, shipY, testNonce, {from: bob});
        }

        assert.equal(await instance.isShipPlacementSaneForPlayer(alice), false, "Should catch ship placement overlap");
        assert.equal(await instance.isShipPlacementSaneForPlayer(bob), false, "Should catch ship placement overlap");
    });

    it("should not allow ships to be placed out of board", async () => {

        let instance = await Battleship.new(0);
        let boardShips = await instance.getBoardShips();
        let boardWidth = instance.boardWidth();
        let boardHeight = instance.boardHeight();

        var maxShipLength = boardShips.reduce(function(a, b) {
            return Math.max(a, b);
        });

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other (except Bob's last ship)
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, {from: alice});
            if (shipNumber < boardShips.length - 1) {
                await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
            } else {
                // For the last ship, we place it at the bottom right
                commitHash = await instance.calculateCommitHash(shipWidth, 1, boardWidth - 1, boardHeight - 1, testNonce);
                await instance.submitHiddenShip(shipNumber, commitHash, {from: bob});
            }
        }

        for (let shipNumber = 0; shipNumber < boardShips.length - 1; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            await instance.revealShip(shipNumber, shipWidth, 1, 0, shipNumber, testNonce, {from: alice});
            if (shipNumber < boardShips.length - 1) {
                await instance.revealShip(shipNumber, shipWidth, 1, 0, shipNumber, testNonce, {from: bob});
            } else {
                await catchRevert(instance.revealShip(shipNumber, shipWidth, 1, 0, shipNumber, testNonce, {from: bob}));
            }
        }

    });

    // Can create more tests for outcome of game (gameEndState) when ships have invalid placement
});

/*
contract('Game payments', async (accounts) => {

    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];

    let timestamp = 1535187520;

    it("draw should refund both players", async () => {

        let contract = await BattleshipTest.new(1000, timestamp);

        contract.depositBet({from: alice, value: 1000});
        contract.depositBet({from: bob, value: 1000});

        contract.setGameEndState(GameEndState_Draw);
        contract.processWinningsTest();

        //contract.withdrawPayments({from: alice, gas: 5000000});

        const PaidToEscrow = await contract.PaidToEscrow();
        const log = await new Promise(function(resolve, reject) {
            PaidToEscrow.watch(function(error, log){ resolve(log);});
        });

        console.log(log);
        console.log(log.args);
        
    });

});
*/