window.setTimeout(function() {
var app = new Vue({
  el: '#app',
  data: {
    message: 'Hello Vue!',
    web3Provider: null,
    contracts: {},
  },

  created: function () {
    return this.initWeb3();
  },

  methods: {

    initWeb3: function () {
      // Is there an injected web3 instance?
      if (typeof web3 !== 'undefined') {
        this.web3Provider = window.web3.currentProvider;
      } else {
        // If no injected web3 instance is detected, fall back to Ganache
        this.web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
      }
      web3 = new Web3(this.web3Provider);

      return this.initContract();
    },

    initContract: function () {
      axios.get('Lobby.json').then(data => {
        // Get the necessary contract artifact file and instantiate it with truffle-contract
        var LobbyArtifact = data;
        console.log(this.contracts);
        this.contracts.Lobby = TruffleContract(LobbyArtifact);

        // Set the provider for our contract
        this.contracts.Lobby.setProvider(this.web3Provider);

        return axios.get('Battleship.json');
      }).then(data => {
          // Get the necessary contract artifact file and instantiate it with truffle-contract
          var BattleshipArtifact = data;
          this.contracts.Battleship = TruffleContract(BattleshipArtifact);

          // Set the provider for our contract
          this.contracts.Battleship.setProvider(this.web3Provider);

          // Use our contract to retrieve and mark the adopted pets
          return this.getGames();
      });
    },

    getGames: function () {
      this.contracts.Lobby.deployed().then(instance => {
        lobbyInstance = instance;

        return lobbyInstance.getGamesBelongingToPlayer.call();
      }).then(gameAddresses => {
        console.log("Games List", gameAddresses);
        for (i = 0; i < gameAddresses.length; i++) {
          var gameAddress = gameAddresses[i];
          $('#games-list').append('<div>' + gameAddress + '</div>');

          var battleshipInstance = this.contracts.Battleship.at(gameAddress);
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

        this.contracts.Lobby.deployed().then(function (instance) {
          lobbyInstance = instance;

          // Execute adopt as a transaction by sending account
          return lobbyInstance.createGame({ from: account });
        }).then(function (result) {
          return this.getGames();
        }).catch(function (err) {
          console.log(err.message);
        });
      });
    },

  }


});

}, 2000);

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
