const Battleship = artifacts.require("Battleship");
const catchRevert = require("./exceptions.js").catchRevert;

const GAMESTATE_CREATED = 0;
const GAMESTATE_PLAYERSJOINED = 1;
const GAMESTATE_STARTED = 2;
const GAMESTATE_FINISHED = 3;
const GAMESTATE_SHIPSREVEALED = 4;
const GAMESTATE_ENDED = 5;

contract('Game startup', async (accounts) => {
    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const carol = accounts[3];

    const emptyAddress = '0x0000000000000000000000000000000000000000';
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