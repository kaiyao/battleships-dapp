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
        contract = await Battleship.new()
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
        let instance = await Battleship.new();
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

    let boardShips;

    beforeEach(async () => {
        let instance = await Battleship.new();
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

    let boardShips;

    beforeEach(async () => {
        let instance = await Battleship.new();
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


contract('Game finishing ' + assumptionsReminder, async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let boardShips;

    let cacheAlice = {
        revealShips: [],
        revealShipsCount: 0,
        hiddenShips: [],
        hiddenShipsCount: 0,
        moves: [],
        movesCount: 0,
        hitCount: 0,
        perShipHitCount: [],
    };

    let cacheBob = {
        revealShips: [],
        revealShipsCount: 0,
        hiddenShips: [],
        hiddenShipsCount: 0,
        moves: [],
        movesCount: 0,
        hitCount: 0,
        perShipHitCount: [],
    };

    let cacheAliceMoves = [];
    let cacheAliceMovesCount = 0;
    let cacheAliceRevealedShips = [];
    let cacheBobMoves = [];
    let cacheBobMovesCount = 0;
    let cacheBobRevealedShips = [];

    before(async () => {

        let instance = await BattleshipTest.new();
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
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
        }

        // Play until all the ships have been hit except last ship (boardShips.length - 1 to exclude last row)
        for (let y = 0; y < boardShips.length - 1; y++) {
            // maxShipLength + 1 to make it easier to calculate stuff (don't have to handle wrapping)
            for (let x = 0; x < maxShipLength + 1; x++) {
                if (y == 0 && x == 0) { // first move
                    //console.log("alice", x, y);
                    await instance.makeMove(x, y, {from: alice});
                } else if (x > 0 && x < boardShips[y]) { // if ship is length 5, x = 1 .. 5 is when opponent put x = 0 .. 4 which is hit
                    //console.log("alice", x, y, 'Hit', y);
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Hit'), y, {from: alice}); 
                } else if (x == boardShips[y]) { // if ship is length 5, at x = 5, opponent just put x = 4 and sunk the ship in previous move
                    //console.log("alice", x, y, 'Hit', y, boardShips[y], 1, 0, y);
                    await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(x, y, convertMoveResultToNumber('Hit'), y, boardShips[y], 1, 0, y, testNonce, {from: alice});
                } else {
                    //console.log("alice", x, y, 'Miss', 0);
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Miss'), 0, {from: alice}); 
                }

                //console.log("bob", x, y);
                if (x < boardShips[y] - 1) { // if ship is length 5, x = 0 .. 4 is hit
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Hit'), y, {from: bob}); 
                } else if (x == boardShips[y] - 1) { // if ship is length 5, at x = 4, opponent just put sunk the ship in previous move
                    await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(x, y, convertMoveResultToNumber('Hit'), y, boardShips[y], 1, 0, y, testNonce, {from: bob});
                } else {
                    await instance.makeMoveAndUpdateLastMoveWithResult(x, y, convertMoveResultToNumber('Miss'), 0, {from: bob}); 
                }
            }
        }

        // because it takes some time to set up the moves, we "cache" them and use them to create new instances in beforeEach
        cacheAlice.moves = await instance.getPlayerMovesPacked(alice);
        cacheAlice.movesCount = await instance.getPlayerMovesCount(alice);
        cacheAlice.revealShips = await instance.getRevealShipsPackedForPlayer(alice);
        cacheAlice.revealShipsCount = await instance.getRevealShipsCountForPlayer(alice);
        cacheAlice.hiddenShips = await instance.getHiddenShipsPacked({from: alice});
        cacheAlice.hiddenShipsCount = (await instance.getBoardShips()).length;
        cacheAlice.hitCount = await instance.getHitCountForPlayer(alice);
        cacheAlice.perShipHitCount = await instance.getPerShipHitCountForPlayer(alice);

        cacheBob.moves = await instance.getPlayerMovesPacked(bob);
        cacheBob.movesCount = await instance.getPlayerMovesCount(bob);
        cacheBob.revealShips = await instance.getRevealShipsPackedForPlayer(bob);
        cacheBob.revealShipsCount = await instance.getRevealShipsCountForPlayer(bob);
        cacheBob.hiddenShips = await instance.getHiddenShipsPacked({from: bob});
        cacheBob.hiddenShipsCount = (await instance.getBoardShips()).length;
        cacheBob.hitCount = await instance.getHitCountForPlayer(bob);
        cacheBob.perShipHitCount = await instance.getPerShipHitCountForPlayer(bob);

        contract = instance;
    });

    beforeEach(async () => {
        // Before each test, create a new BattleShip contract with same state as the one above

        let instance = await BattleshipTest.new();
        await instance.setTestMode(); // enable testMode
        boardShips = await instance.getBoardShips();
        var maxShipLength = boardShips.reduce(function(a, b) {
            return Math.max(a, b);
        });

        await instance.joinGameForPlayer(alice);
        await instance.joinGameForPlayer(bob);

        //console.log("submit hidden ships packed");
        await instance.submitHiddenShipsPacked(cacheAlice.hiddenShips[0], cacheAlice.hiddenShips[1], {from: alice});
        await instance.submitHiddenShipsPacked(cacheBob.hiddenShips[0], cacheBob.hiddenShips[1], {from: bob});
        
        //console.log("set player moves packed");
        await instance.setPlayerMovesPacked(alice, cacheAlice.movesCount, cacheAlice.moves[0], cacheAlice.moves[1], cacheAlice.moves[2], cacheAlice.moves[3], {from: owner});
        //console.log("set reveal ships packed");
        await instance.setRevealShipsPackedForPlayer(alice, cacheAlice.revealShipsCount, cacheAlice.revealShips[0], cacheAlice.revealShips[1], cacheAlice.revealShips[2], cacheAlice.revealShips[3], {from: owner});
        //console.log("set hit count");
        await instance.setHitCountForPlayer(alice, cacheAlice.hitCount, {from: owner});
        //console.log("set per ship hit count packed");
        await instance.setPerShipHitCountForPlayer(alice, cacheAlice.perShipHitCount, {from: owner});

        await instance.setPlayerMovesPacked(bob, cacheBob.movesCount, cacheBob.moves[0], cacheBob.moves[1], cacheBob.moves[2], cacheBob.moves[3], {from: owner});
        await instance.setRevealShipsPackedForPlayer(bob, cacheBob.revealShipsCount, cacheBob.revealShips[0], cacheBob.revealShips[1], cacheBob.revealShips[2], cacheBob.revealShips[3], {from: owner});
        await instance.setHitCountForPlayer(bob, cacheBob.hitCount, {from: owner});
        await instance.setPerShipHitCountForPlayer(bob, cacheBob.perShipHitCount, {from: owner});

        contract = instance;
    });

    it("should determine winner correctly (player 1 wins)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        //console.log('hahaha');
        await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(1, 4, convertMoveResultToNumber('Hit'), 4, 2, 1, 0, 4, testNonce, {from: bob});
        //console.log('hahaha2');

        // Since alice has won, alice also needs to reveal all her ships
        // If not all ships revealed the checks below will fail!!
        await instance.revealShip(4, 2, 1, 0, 4, testNonce, {from: alice});

        //console.log('updating last opponent move');
        //await instance.updateLastOpponentMoveWithResult(convertMoveResultToNumber('Hit'), 4, {from: bob});
        //console.log('reveal ship');
        //await instance.revealShip(4, 2, 1, 0, 4, testNonce, {from: bob});
        //console.log('make move');
        //await instance.makeMove(1, 4, {from: bob});

        //console.log('check winner');

        //console.log('player1shipplacement', await instance.isShipPlacementSaneForPlayer(alice));
        //console.log('player2shipplacement', await instance.isShipPlacementSaneForPlayer(bob));

        //console.log('player1movesreportedcorrectly', await instance.isMovesReportedCorrectlyForPlayer(alice));
        //console.log('player2movesreportedcorrectly', await instance.isMovesReportedCorrectlyForPlayer(bob));

        let endState = await instance.checkWinnerWhenBothPlayersRevealedShips();
        assert.equal(endState.toNumber(), GameEndState_Player1WinsValidGame, "alice wins because she sunk all the ships first");
    });

    it("should determine winner correctly (player 2 wins)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(5, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 0, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(6, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Miss'), 0, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(7, 4, convertMoveResultToNumber('Hit'), 4, 2, 1, 0, 4, testNonce, {from: alice});
       
        // Since bob has won, bob also needs to reveal all his ships
        // If not all ships revealed the checks below will fail!!
        await instance.revealShip(4, 2, 1, 0, 4, testNonce, {from: bob});

        let endState = await instance.checkWinnerWhenBothPlayersRevealedShips();
        assert.equal(endState.toNumber(), GameEndState_Player2WinsValidGame, "bob wins because she sunk all the ships first");
    });

    it("should detect wrongly reported moves (player 1)", async () => {
        let instance = contract;

        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Miss'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Miss'), 4, {from: alice}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(1, 4, convertMoveResultToNumber('Hit'), 4, 2, 1, 0, 4, testNonce, {from: bob});
       
        // Since alice has won, alice also needs to reveal all her ships
        // If not all ships revealed the checks below will fail!!
        await instance.revealShip(4, 2, 1, 0, 4, testNonce, {from: alice});

        let endState = await instance.checkWinnerWhenBothPlayersRevealedShips();
        assert.equal(endState.toNumber(), GameEndState_Player2WinsInvalidGame, "bob wins - alice has misreported");
    });

    it("should detect wrongly reported moves (player 2)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(5, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 0, {from: bob}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResult(6, 4, convertMoveResultToNumber('Hit'), 4, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Miss'), 0, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(7, 4, convertMoveResultToNumber('Hit'), 4, 2, 1, 0, 4, testNonce, {from: alice});
       
        // Since bob has won, bob also needs to reveal all his ships
        // If not all ships revealed the checks below will fail!!
        await instance.revealShip(4, 2, 1, 0, 4, testNonce, {from: bob});

        let endState = await instance.checkWinnerWhenBothPlayersRevealedShips();
        assert.equal(endState.toNumber(), GameEndState_Player1WinsInvalidGame, "alice wins because, even though bob sunk all the ships first, bob has misreported");
    });

    it("should detect wrongly reported moves (both)", async () => {
        let instance = contract;

        // last row with ship length = 2
        await instance.makeMoveAndUpdateLastMoveWithResult(5, 4, convertMoveResultToNumber('Miss'), 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 4, convertMoveResultToNumber('Hit'), 4, {from: bob}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResult(6, 4, convertMoveResultToNumber('Miss'), 0, {from: alice}); // incorrect report
        await instance.makeMoveAndUpdateLastMoveWithResult(1, 4, convertMoveResultToNumber('Miss'), 0, {from: bob});
        await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(7, 4, convertMoveResultToNumber('Hit'), 4, 2, 1, 0, 4, testNonce, {from: alice});
       
        // Since bob has won, bob also needs to reveal all his ships
        // If not all ships revealed the checks below will fail!!
        await instance.revealShip(4, 2, 1, 0, 4, testNonce, {from: bob});

        let endState = await instance.checkWinnerWhenBothPlayersRevealedShips();
        assert.equal(endState.toNumber(), GameEndState_Draw, "draw because both players mis-reported");
    });
});

contract('Game detects invalid ship placements ' + assumptionsReminder, async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    let boardShips;

    it("should not allow overlapping ships", async () => {

        let instance = await Battleship.new();
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
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
        }

        for (let shipNumber = 0; shipNumber < boardShips.length - 1; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            let shipY = shipNumber;
            if (shipNumber == boardShips.length - 1) {
                shipY = shipNumber - 1;
            }
            await instance.revealShip(shipNumber, shipWidth, 1, 0, shipY, testNonce, {from: alice});
            await instance.revealShip(shipNumber, shipWidth, 1, 0, shipY, testNonce, {from: bob});
        }

        let shipNumber = boardShips.length - 1;
        let shipWidth = boardShips[shipNumber];
        let shipY = shipNumber - 1;
        await catchRevert(instance.revealShip(shipNumber, shipWidth, 1, 0, shipY, testNonce, {from: alice}));
        await catchRevert(instance.revealShip(shipNumber, shipWidth, 1, 0, shipY, testNonce, {from: bob}));

    });

    it("should not allow ships to be placed out of board", async () => {

        let instance = await Battleship.new();
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
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});
            if (shipNumber < boardShips.length - 1) {
                await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
            } else {
                // For the last ship, we place it at the bottom right
                commitHash = await instance.calculateCommitHash(shipWidth, 1, boardWidth - 1, boardHeight - 1, testNonce);
                await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
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
});