const Battleship = artifacts.require("Battleship");
const catchRevert = require("./exceptions.js").catchRevert;

const GAMESTATE_CREATED = 0;
const GAMESTATE_PLAYERSJOINED = 1;
const GAMESTATE_STARTED = 2;
const GAMESTATE_FINISHED = 3;
const GAMESTATE_SHIPSREVEALED = 4;
const GAMESTATE_ENDED = 5;

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

        await instance.joinPlayer(alice);
        await instance.joinPlayer(bob);

        assert.equal(await instance.player1(), alice, "player 1 should match");
        assert.equal(await instance.player2(), bob, "player 2 should match");

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");
    });

    it("state should change accordingly", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinPlayer(alice);
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should still be CREATED");

        await instance.joinPlayer(bob);
        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");
    });

    it("should not be able add two same players", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        instance.joinPlayer(alice);
        await catchRevert(instance.joinPlayer(alice));
    });

    it("should not be able add three players", async () => {
        let instance = contract;
        assert.equal(await instance.gameState(), GAMESTATE_CREATED, "game state should be CREATED");

        await instance.joinPlayer(alice);
        await instance.joinPlayer(bob);
        await catchRevert(instance.joinPlayer(carol));
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
        await instance.joinPlayer(alice);

        let shipNumber = 0; // test the smallest possible ship number
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
        await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});

        let hiddenShips = await instance.getHiddenShipsPacked({from: alice});
        assert.equal(hiddenShips[0][shipNumber], commitHash, "ship should be in list");
        assert.equal(hiddenShips[1][shipNumber], commitNonceHash, "ship should be in list");

        shipNumber = boardShips.length - 1; // test the largest possible ship number
        shipWidth = boardShips[shipNumber];
        commitHash = await instance.calculateCommitHash(shipWidth, 1, 2, 2, testNonce);
        commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
        await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});

        hiddenShips = await instance.getHiddenShipsPacked({from: alice});
        assert.equal(hiddenShips[0][shipNumber], commitHash, "ship should be in list");
        assert.equal(hiddenShips[1][shipNumber], commitNonceHash, "ship should be in list");
    });

    it("should be able add ships with two players", async () => {
        let instance = contract;
        await instance.joinPlayer(alice);
        await instance.joinPlayer(bob);

        let shipNumber = 0;
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
        await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});

        let hiddenShips = await instance.getHiddenShipsPacked({from: alice});
        assert.equal(hiddenShips[0][shipNumber], commitHash, "alice ship should be in list");
        assert.equal(hiddenShips[1][shipNumber], commitNonceHash, "alice ship should be in list");

        await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
        hiddenShips = await instance.getHiddenShipsPacked({from: bob});
        assert.equal(hiddenShips[0][shipNumber], commitHash, "bob ship should be in list");
        assert.equal(hiddenShips[1][shipNumber], commitNonceHash, "bob ship should be in list");
    });

    it("should not be able add ships if not a player", async () => {
        let instance = contract;
        let shipNumber = 0;
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
        await catchRevert(instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: carol}));
    });

    it("should not be able add ships outside of number of ships allowed", async () => {
        let instance = contract;
        let shipNumber = 0;
        let invalidShipNumber;
        let shipWidth = boardShips[shipNumber];
        let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, 0, testNonce);
        let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
        invalidShipNumber = boardShips.length;
        await catchRevert(instance.submitHiddenShip(invalidShipNumber, commitHash, commitNonceHash, {from: alice}));
        invalidShipNumber = -1;
        await catchRevert(instance.submitHiddenShip(invalidShipNumber, commitHash, commitNonceHash, {from: alice}));
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

        await instance.joinPlayer(alice);
        await instance.joinPlayer(bob);

        contract = instance;
    });

    it("should change state once both players have placed ships", async () => {
        let instance = contract;

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");
        
        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});
        }

        assert.equal(await instance.gameState(), GAMESTATE_PLAYERSJOINED, "game state should be PLAYERSJOINED");

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
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
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});
        }

        await catchRevert(instance.makeMove(0, 0, {from: alice}));

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
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

        await instance.joinPlayer(alice);
        await instance.joinPlayer(bob);

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: alice});
        }

        for (let shipNumber = 0; shipNumber < boardShips.length; shipNumber++) {
            let shipWidth = boardShips[shipNumber];
            // just put the ships next to each other
            let commitHash = await instance.calculateCommitHash(shipWidth, 1, 0, shipNumber, testNonce);
            let commitNonceHash = await instance.calculateCommitNonceHash(testNonce);
            await instance.submitHiddenShip(shipNumber, commitHash, commitNonceHash, {from: bob});
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

    it("should not be able to make move if ship shot down but not revealed", async () => {
        let instance = contract;

        // First ship is 5 squares long, we simulate hitting that
        await instance.makeMove(0, 0, {from: alice});
        await instance.makeMoveAndUpdateLastMoveWithResult(0, 0, convertMoveResultToNumber('Hit'), 0, {from: bob});
        for (let i = 1; i <= 3; i++) {
            //console.log(i, 'alice');
            await instance.makeMoveAndUpdateLastMoveWithResult(i, 0, convertMoveResultToNumber('Hit'), 0, {from: alice});
            //console.log(i, 'bob');
            await instance.makeMoveAndUpdateLastMoveWithResult(i, 0, convertMoveResultToNumber('Hit'), 0, {from: bob});
        }
        await instance.makeMoveAndUpdateLastMoveWithResult(4, 0, convertMoveResultToNumber('Hit'), 0, {from: alice});
        await catchRevert(instance.makeMoveAndUpdateLastMoveWithResult(4, 0, convertMoveResultToNumber('Hit'), 0, {from: bob}));

        await instance.makeMoveAndUpdateLastMoveWithResultAndRevealShip(4, 0, convertMoveResultToNumber('Hit'), 0, 5, 1, 0, 0, testNonce, {from: bob});

    });
});