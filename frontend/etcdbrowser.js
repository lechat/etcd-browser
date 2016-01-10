var app = angular.module("app", [
    "xeditable",
    "mc.resizer",
    "ui.bootstrap",
    "ang-drag-drop",
    "pageslide-directive"
]);

app.controller('NodeCtrl', [
        '$scope','$http','$location','$q', '$uibModal', '$log',
        function($scope,$http,$location,$q, $uibModal, $log) {
  var keyPrefix = '/v2/keys',
      statsPrefix = '/v2/stats';

  $scope.urlPrefix = $location.search().etcd || $location.protocol() + "://" + document.location.host;
  $scope.new_item = {
    name: '',
    value: '',
    isDir: false,
    node: null
  };

  $scope.slideOpen = false;

  $scope.toggleSlide = function () {
      $scope.slideOpen = !$scope.slideOpen;
  }

  $scope.getPrefix = function() {
    if ($scope.urlPrefix) {
      var splitted = $scope.urlPrefix.split("/");
      return splitted[0] + "//" + splitted[2]
    }
    return ''
  }


  $scope.setActiveNode = function(node) {
    $scope.activeNode = node;
    if (node.open) {
      $scope.loadNode(node);
    } else {
      $scope.toggleNode(node);
    }
  }

  function keyErrorHandler(data, url){
    var message = data;
    if(data.message) {
      message = data.message;
    }
    $scope.error = "Request failed - " + message + " - " + url;
  }

  function errorHandler(data, status, headers, config){
    var message = data;
    if(data.message) {
      message = data.message;
    }
    $scope.error = "Request failed - " + message + " - " + config.url;
    $scope.loading = false;
  }

  $scope.loadNode = function(node){
    delete $scope.error;
    $scope.loading = true;
    var url = $scope.getPrefix() + keyPrefix + node.key;
    $http({method: 'GET', url: url}).
      success(function(data) {
        if (! angular.isDefined(data.node)) {
            keyErrorHandler(data, url);
        } else {
            prepNodes(data.node.nodes, node);
            node.nodes = data.node.nodes;
            $scope.urlPrefix = $scope.getPrefix() + keyPrefix + node.key
        }
        $scope.loading = false;
      }).
      error(errorHandler);
  }

  $scope.toggleNode = function(node) {
    node.open = !node.open;
    if (node.open) {
      $scope.loadNode(node);
    } else {
      node.nodes = [];
    }
  };
  $scope.hasProperties = function(node){
    for(var key in node.nodes){
      if(!node.nodes[key].dir){
        return true;
      }
    }
  }

  $scope.submit = function(){
    var splitted = $scope.urlPrefix.split("/");
    // var etcd = splitted[0] + "//" + splitted[2];
    // if (etcd !== $location.protocol() + "://" + document.location.host === !$location.search().etcd) {
    //   $location.search('etcd', etcd);
    // }
    $scope.root = {
        key: '/' + splitted.slice(5).join('/'),
        name: splitted.slice(-1)
    }
    delete $scope.activeNode;
    $scope.loadNode($scope.root);
  }

  $scope.setRoot = function () {
    $scope.modalNewItem({
        title: 'Set tree root',
        firstInput: {
            label: 'To',
            value: $scope.urlPrefix
        },
        secondInput: {},
        isDir: true,
        node: null
    }, function() {
        $scope.urlPrefix = $scope.new_item.firstInput.value;
        $scope.submit();
    });
  }

  $scope.resetRoot = function () {
    $scope.root = {
        key: '/',
        name: '/'
    }
    delete $scope.activeNode;
    $scope.loadNode($scope.root);
  }

  $scope.addNode = function(node){
    $scope.modalNewItem({
        title: 'New Key/Value pair for node ' + node.key,
        firstInput: {
            label: 'Name',
            value: ''
        },
        secondInput: {
            label: 'Value',
            value: ''
        },
        isDir: false,
        node: node
    }, function() {
        var name = $scope.new_item.firstInput.value;
        var value = $scope.new_item.secondInput.value;
        var node = $scope.new_item.node;

        if (!name || name == "") return;

        $http({method: 'PUT',
               url: $scope.getPrefix() + keyPrefix + node.key + (node.key != "/" ? "/" : "") + name,
               params: {"value": value}}).
        success(function(data) {
          $scope.loadNode(node);
        }).
        error(errorHandler);
      });
  }

  $scope.checkboxModel = {
    use_json_validation : false
  };
  $scope.updateNode = function(node,value){
    if ($scope.checkboxModel.use_json_validation) {
      try {
        JSON.parse(value);
      } catch (err) {
        return 'Not a json';
      }
    }
    $http({method: 'PUT',
      url: $scope.getPrefix() + keyPrefix + node.key,
      params: {"value": value}}).
    success(function(data) {
      $scope.loadNode(node);
    }).
    error(errorHandler);
  }

  $scope.renameNode = function(node,keyName){
    var newkey = node.key.slice(0, node.key.lastIndexOf('/')+1) + keyName;
    if (newkey == node.key) {
       return;
    }
    var d = $q.defer();
    var reject = function(e) {
      d.reject('Server Error');
    }
    $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key}).
      success(function(data) {
        if (data.node.value != node.value) {
          d.resolve('The value has changed by someone else');
          return
        }
        $http({method: 'PUT',
               url: $scope.getPrefix() + keyPrefix + newkey,
               params: {"value": node.value}}).
          success(function(data) {
            $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key}).
              success(function(data) {
                if (data.node.value != node.value) {
                  $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + newkey}).
                    success(function(data) {
                      d.resolve('The value has changed by someone else');
                    }).
                    error(reject);
                } else {
                  $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + node.key}).
                    success(function(data) {
                      $scope.loadNode(node.parent);
                      d.resolve();
                    }).
                    error(reject);
                }
              }).
              error(reject);
          }).
          error(reject);
      }).
      error(reject);
    return d.promise;
  }

  $scope.deleteNode = function(node){
    $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + node.key}).
    success(function(data) {
      $scope.loadNode(node.parent);
    }).
    error(errorHandler);
  }

  $scope.copyNode = function(node){
    var dirName = prompt("Copy property to directory","/");
    if(!dirName || dirName == "") return;
    dirName = $scope.formatDir(dirName);
    $http({method: 'PUT',
      url: $scope.getPrefix() + keyPrefix + dirName + node.name,
      params: {"value": node.value}}).
    error(errorHandler);
  }

  $scope.createDir = function(node){
    $scope.modalNewItem({
        title: 'New Node under ' + node.key,
        firstInput: {
            label: 'Name',
            value: ''
        },
        secondInput: {},
        isDir: true,
        node: node
    }, function() {
        var dirName = $scope.new_item.firstInput.value;
        if (!dirName || dirName == "") return;

        var node = $scope.new_item.node;
        $http({method: 'PUT',
          url: $scope.getPrefix() + keyPrefix + node.key + (node.key != "/" ? "/" : "") + dirName,
          params: {"dir": true}}).
        success(function(data) {
          $scope.loadNode(node);
        }).
        error(errorHandler);
      }
    );
  }

  $scope.copyDirAux = function(source, target, rename, deferred){
    var deferred = deferred || false;
    if (!deferred) {
      deferred = $q.defer();
    }

    var verifyUrl = $scope.getPrefix() + keyPrefix + source.key;
    $http({method: 'GET', url: verifyUrl})
    .then(function(data) {
        console.log('Called verifyUrl: ' + verifyUrl);
        if ('nodes' in source && typeof source.nodes !== 'undefined') {
          prepNodes(data.node.nodes, source);
        }

        var inPlace = rename || false;
        if (!inPlace) {
          var url = $scope.getPrefix() + keyPrefix + target + source.name;
        } else {
          var url = $scope.getPrefix() + keyPrefix + target;
        }
        $http({method: 'PUT', url: url, params: {"dir": true}})
        .then(function(ignored){
          if ('nodes' in data && typeof data.nodes !== 'undefined') {
            source.nodes = data.node.nodes;
            source.nodes.forEach(function (child) {
              if (child.dir) {
                if (!inPlace) {
                  $scope.copyDirAux(child, target + source.name + "/", inPlace, deferred);
                } else {
                  $scope.copyDirAux(child, target + child.name + "/", inPlace, deferred);
                }
              } else {
                if (!inPlace) {
                  var url = $scope.getPrefix() + keyPrefix + target + source.name + '/' + child.name;
                } else {
                  var url = $scope.getPrefix() + keyPrefix + target + child.name;
                }
                $http({
                  method: 'PUT', url: url,
                  params: {"value": child.value}})
                .then((), errorHandler);
              }
            })
          }
        },errorHandler());
      },errorHandler());
      return deferred.promise;
  }

  $scope.copyDir = function(node){
    $scope.modalNewItem({
        title: 'Copy Node from ' + node.key,
        firstInput: {
            label: 'To',
            value: ''
        },
        secondInput: {},
        isDir: true,
        node: node
    }, function() {
        var dirName = $scope.new_item.firstInput.value;
        var node = $scope.new_item.node;

        if(!dirName || dirName == "") return;

        dirName = $scope.formatDir(dirName);
        $scope.copyDirAux(node, dirName)
      }
    );
  }

  // TODO: handle old style - merge on copy
  // TODO: handle move
  $scope.copyDirDrop = function(event, source, target){
    return $scope.modalNewItem({
        title: 'copy node from ' + source.key,
        firstInput: {
            label: 'to',
            value: target.key
        },
        secondInput: {},
        isDir: true,
        node: source
    }, function() {
        var dirname = $scope.new_item.firstInput.value;
        var node = $scope.new_item.node;

        if(!dirname || dirname == "") return;

        dirname = $scope.formatDir(dirname);
        $scope.copyDirAux(node, dirname)

        $scope.loadNode(target);
        $scope.setActiveNode(target);
      }
    );
  }

  $scope.renameDir = function(node){
    return $scope.modalNewItem({
        title: 'Rename node from ' + node.key,
        firstInput: {
            label: 'to',
            value: node.key
        },
        secondInput: {},
        isDir: true,
        node: node
    }, function() {
        var target = $scope.new_item.firstInput.value;
        var node = $scope.new_item.node;

        if(!target || target == "") return;

        target = $scope.formatDir(target);
        $scope.copyDirAux(node, target, true)

        $scope.deleteDir(node, true);

        $scope.loadNode(target);
        $scope.setActiveNode(target);
      }
    );
  }

  $scope.deleteDir = function(node, dontAsk) {
    if (typeof dontAsk == 'undefined') {
      if(!confirm("Are you sure you want to delete " + node.key)) return;
    }
    $http({method: 'DELETE',
      url: $scope.getPrefix() + keyPrefix + node.key + "?dir=true&recursive=true"}).
    success(function(data) {
      $scope.loadNode(node.parent);
    }).
    error(errorHandler);
  }

  $scope.formatDir = function(dirName){
    if(dirName.substr(dirName.trim().length - 1) != '/'){
      dirName += '/';
    }
    return dirName;
  }

  angular.element(document).ready($scope.submit());
  // $scope.$watch('$viewContentLoaded', $scope.submit());
  // $scope.submit();

  function prepNodes(nodes, parent){
    for(var key in nodes){
      var node = nodes[key];
      var name = node.key.substring(node.key.lastIndexOf("/")+1);
      node.name = name;
      node.parent = {
          key: parent.key,
          name: parent.name,
          dir: true,
          nodes: []
      }
    }
  }

  $scope.loadStats = function(){
    console.log("LOAD STATS");
    $scope.stats = {};
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/store"}).
    success(function(data) {
      $scope.stats.store = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
    delete $scope.storeStats;
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/leader"}).
    success(function(data) {
      $scope.stats.leader = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
    delete $scope.storeStats;
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/self"}).
    success(function(data) {
      $scope.stats.self = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
  }

  $scope.modalNewItem = function (item, onPromise) {
    $scope.new_item = item;
    var modalInstance = $uibModal.open({
      templateUrl: 'modal-dialog.html',
      controller: 'ModalInstanceCtrl',
      resolve: {
        new_item: function () {
          return $scope.new_item;
        }
      }
    });

    modalInstance.result.then(function (new_item) {
        onPromise();
    }, function () {
        // dismissed - do nothing
    });

    return modalInstance.result;
  }

}]);

app.filter('prettyJson', function () {
    function ppJson(json) {
        return JSON ? JSON.stringify(json, null, '  ') : 'your browser doesnt support JSON so cant pretty print';
    }
    return ppJson;
});

app.run(function(editableOptions, editableThemes) {
  editableThemes.bs3.inputClass = 'input-sm';
  editableThemes.bs3.buttonsClass = 'btn-sm';
  editableOptions.theme = 'bs3';
});

app.controller('ModalInstanceCtrl', function ($scope, $uibModalInstance, new_item) {
    $scope.new_item = new_item;

    $scope.newItemOk = function () {
      $uibModalInstance.close($scope.new_item);
    };

    $scope.newItemCancel = function () {
      $uibModalInstance.dismiss('cancel');
    };
});

