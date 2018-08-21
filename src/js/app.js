window.addEventListener('load', () => {

  window.web3Provider = null;
  // https://github.com/mesirendon/DappExample/blob/master/src/main.js
  if (typeof web3 !== 'undefined') {
    console.log('Web3 injected browser: OK.')
    window.web3Provider = window.web3.currentProvider;
  } else {
    console.log('Web3 injected browser: Fail. You should consider trying MetaMask.');
    window.web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
  }

  window.web3 = new Web3(window.web3Provider);

  window.app = new Vue({
    el: '#app',
    data: {
      contracts: {},
      player: "",
      playerGames: {},
      openGames: {},
      newGameOpponent: "",
    },

    created: function () {
      return this.initWeb3();
    },

    methods: {

      initWeb3: function () {
        return this.initContract();
      },

      initContract: function () {
        axios.get('Lobby.json').then(response => {
          let data = response.data;

          // Get the necessary contract artifact file and instantiate it with truffle-contract
          var LobbyArtifact = data;
          console.log(this.contracts);
          this.contracts.Lobby = TruffleContract(LobbyArtifact);

          // Set the provider for our contract
          this.contracts.Lobby.setProvider(window.web3Provider);

          return axios.get('Battleship.json');
        }).then(response => {
          let data = response.data;

          // Get the necessary contract artifact file and instantiate it with truffle-contract
          var BattleshipArtifact = data;
          this.contracts.Battleship = TruffleContract(BattleshipArtifact);

          // Set the provider for our contract
          this.contracts.Battleship.setProvider(window.web3Provider);

          // Use our contract to retrieve and mark the adopted pets
          return this.getGames();
        });
      },

      getGames: function () {
        this.getPlayerGames();
        this.getOpenGames();
      },

      getPlayerGames: function () {
        this.contracts.Lobby.deployed().then(instance => {
          lobbyInstance = instance;

          return lobbyInstance.getGamesBelongingToPlayer.call();
        }).then(gameAddresses => {
          console.log("Games List", gameAddresses);
          for (let i = 0; i < gameAddresses.length; i++) {

            let closure = () => {
              var gameAddress = gameAddresses[i];
              this.$set(this.playerGames, gameAddress, {});

              var battleshipInstance = this.contracts.Battleship.at(gameAddress);
              battleshipInstance.player1.call().then(val => {
                console.log("battleship1", gameAddress, val);
                //this.games[gameAddress].player1 = val;
                this.$set(this.playerGames[gameAddress], 'player1', val);
              });
              battleshipInstance.player2.call().then(val => {
                console.log("battleship2", gameAddress, val);
                this.$set(this.playerGames[gameAddress], 'player2', val);
              });
              battleshipInstance.gameState.call().then(val => {
                console.log("battleshipg", gameAddress, val);
                this.$set(this.playerGames[gameAddress], 'state', val);
              });
            };
            closure();
            
          }
        }).catch(function (err) {
          console.log(err.message);
        });
      },

      /*getOpenGames: function () {
        this.contracts.Lobby.deployed().then(instance => {
          lobbyInstance = instance;

          return lobbyInstance.getGamesBelongingToPlayer.call();
        }).then(gameAddresses => {
          console.log("Games List", gameAddresses);
          for (let i = 0; i < gameAddresses.length; i++) {
            var gameAddress = gameAddresses[i];
            this.$set(this.games, gameAddress, {});

            var battleshipInstance = this.contracts.Battleship.at(gameAddress);
            battleshipInstance.player1.call().then(val => {
              console.log("battleship1", val);
              //this.games[gameAddress].player1 = val;
              this.$set(this.games[gameAddress], 'player1', val);
            });
            battleshipInstance.player2.call().then(val => {
              console.log("battleship2", val);
              this.$set(this.games[gameAddress], 'player2', val);
            });
            battleshipInstance.gameState.call().then(val => {
              console.log("battleshipg", val);
              this.$set(this.games[gameAddress], 'state', val);
            });
          }
        }).catch(function (err) {
          console.log(err.message);
        });
      },*/

      newGame: function () {
        console.log("newgame called");

        web3.eth.getAccounts((error, accounts) => {
          if (error) {
            console.log(error);
          }

          var account = accounts[0];

          this.contracts.Lobby.deployed().then(lobbyInstance => {

            // Execute adopt as a transaction by sending account
            return lobbyInstance.createOpenGame({ from: account });
          }).then(result => {
            return this.getGames();
          }).catch(err => {
            console.log(err.message);
          });
        });
      },

    }


  });

});

/*

App = {
  web3Provider: null,
  contracts: {},

  init: function () {
    return App.initWeb3();
  },

  initWeb3: function () {
    // Is there an injected web3 instance?
    if (typeof web3 !== 'undefined') {
      App.web3Provider = web3.currentProvider;
    } else {
      // If no injected web3 instance is detected, fall back to Ganache
      App.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
    }
    web3 = new Web3(App.web3Provider);

    return App.initContract();
  },

  initContract: function () {
    $.getJSON('Lobby.json', function (data) {
      // Get the necessary contract artifact file and instantiate it with truffle-contract
      var LobbyArtifact = data;
      App.contracts.Lobby = TruffleContract(LobbyArtifact);

      // Set the provider for our contract
      App.contracts.Lobby.setProvider(App.web3Provider);

      $.getJSON('Battleship.json', function (data) {
        // Get the necessary contract artifact file and instantiate it with truffle-contract
        var BattleshipArtifact = data;
        App.contracts.Battleship = TruffleContract(BattleshipArtifact);

        // Set the provider for our contract
        App.contracts.Battleship.setProvider(App.web3Provider);

        // Use our contract to retrieve and mark the adopted pets
        return App.getGames();
      });

    });

    $('#start-new-game').on('click', App.newGame);

  },

  getGames: function () {
    App.contracts.Lobby.deployed().then(function (instance) {
      lobbyInstance = instance;

      return lobbyInstance.getGamesBelongingToPlayer.call();
    }).then(function (gameAddresses) {
      console.log("Games List", gameAddresses);
      for (i = 0; i < gameAddresses.length; i++) {
        var gameAddress = gameAddresses[i];
        $('#games-list').append('<div>' + gameAddress + '</div>');

        var battleshipInstance = App.contracts.Battleship.at(gameAddress);
        battleshipInstance.player1.call().then(function (a) {
          console.log("battleship1", a);
        });
        battleshipInstance.player2.call().then(function (a) {
          console.log("battleship2", a);
        });
        battleshipInstance.gameState.call().then(function (a) {
          console.log("battleshipg", a);
        });
      }
    }).catch(function (err) {
      console.log(err.message);
    });
  },

  newGame: function () {
    console.log("newgame called");
    var lobbyInstance;

    web3.eth.getAccounts(function (error, accounts) {
      if (error) {
        console.log(error);
      }

      var account = accounts[0];

      App.contracts.Lobby.deployed().then(function (instance) {
        lobbyInstance = instance;

        // Execute adopt as a transaction by sending account
        return lobbyInstance.createGame({ from: account });
      }).then(function (result) {
        return App.getGames();
      }).catch(function (err) {
        console.log(err.message);
      });
    });
  },

  markAdopted: function (adopters, account) {
    var adoptionInstance;

    App.contracts.Adoption.deployed().then(function (instance) {
      adoptionInstance = instance;

      return adoptionInstance.getAdopters.call();
    }).then(function (adopters) {
      for (i = 0; i < adopters.length; i++) {
        if (adopters[i] !== '0x0000000000000000000000000000000000000000') {
          $('.panel-pet').eq(i).find('button').text('Success').attr('disabled', true);
        }
      }
    }).catch(function (err) {
      console.log(err.message);
    });
  },

  handleAdopt: function (event) {
    event.preventDefault();

    var petId = parseInt($(event.target).data('id'));

    var adoptionInstance;

    web3.eth.getAccounts(function (error, accounts) {
      if (error) {
        console.log(error);
      }

      var account = accounts[0];

      App.contracts.Adoption.deployed().then(function (instance) {
        adoptionInstance = instance;

        // Execute adopt as a transaction by sending account
        return adoptionInstance.adopt(petId, { from: account });
      }).then(function (result) {
        return App.markAdopted();
      }).catch(function (err) {
        console.log(err.message);
      });
    });
  }

};

$(function () {
  $(window).load(function () {
    App.init();
  });
}); 

*/
