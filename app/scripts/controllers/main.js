'use strict';

angular.module('mappifyApp')
  .controller('MainCtrl', function ($scope, $compile, $timeout,
      mappifyConceptsService, sponateService) {
    /**
     * This is the main controller of the Mappify application. It contains all
     * UI settings, map related settings and code managing Mappify Concepts
     */
    
    /*
     * UI related settings
     * ========================================================================
     */
    // makes the scroll bar in the controls div (on the left hand side) slim
    // and pretty :)
    $scope.slimScrollInit = function() {
      $('.slimscroll').slimScroll({
          height: '100%'
      });
    };
    $scope.$on('$viewContentLoaded', $scope.slimScrollInit);
    
    // Mappify Concept grid
    $scope.selectedMappifyConcept = null;
    $scope.selectionMade = function() {
      return $scope.selectedMappifyConcept !== null;
    };
    $scope.mcs = mappifyConceptsService.getConcepts();
    $scope.conceptGridOptions = {
        data : 'mcs',
        enableCellSelection : true,
        enableRowSelection : true,
        enableCellEdit : true,
        multiSelect : false,
        columnDefs : [{
          field : 'name',
          displayName : 'concepts',
          enableCellEdit : true}],
        afterSelectionChange : function(rowItem) {
          /* This function will be called twice when selecting a new row item:
           * Once for un-selecting the 'old' item and again for selecting the
           * new item. And I'm only interested in the latter case.
           */
          if (rowItem.selected) {
            $scope.$broadcast('mappify-concept-selection-changed');
          }
        },
        beforeSelectionChange: function(rowItem) {
          $scope.$broadcast('mappify-concept-selection-will-change');
          $scope.selectedMappifyConcept = rowItem.entity;
          // return false --> cancel selection; return true --> go on
          return true;
        }
    };
    
    $scope.activeTab = 'ui';
    $scope.getTabClass = function(tabName) {
      if($scope.activeTab === tabName) {
        return 'mappify-control-tab-active';
      } else {
        return undefined;
      }
    };
    
    
    /*
     * map related settings
     * ========================================================================
     */
    
    // call map initialization
    init();
    map.setCenter(
        //  8.85, 53.08  (10.3) --> Bremen
        // 12.35, 51.35  (10)   --> Leipzig
        new OpenLayers.LonLat(-3, 55).transform(
            new OpenLayers.Projection('EPSG:4326'),
            map.getProjectionObject()),
        5.4
    );
    
    // -- layers for initial and maximal map section --
    var initBoxLayer = new OpenLayers.Layer.Vector('initial box', {
      styleMap: new OpenLayers.StyleMap({
        fillColor: '#00FF00', fillOpacity: 0.2 })
      });
    
    var maxBoxLayer = new OpenLayers.Layer.Vector('maximal box', {
      styleMap: new OpenLayers.StyleMap({
        fillColor: '#FF0000', fillOpacity: 0.15 })
    });
    
    map.addLayer(initBoxLayer);
    map.addLayer(maxBoxLayer);
    
    $scope.initBoxDrawCtrl = new OpenLayers.Control.DrawFeature(initBoxLayer,
        OpenLayers.Handler.RegularPolygon,
        { handlerOptions: { sides: 4, irregular: true } }
    );
    map.addControl($scope.initBoxDrawCtrl);

    $scope.maxBoxDrawCtrl = new OpenLayers.Control.DrawFeature(maxBoxLayer,
        OpenLayers.Handler.RegularPolygon,
        { handlerOptions: { sides: 4, irregular: true } }
    );
    map.addControl($scope.maxBoxDrawCtrl);
    
    $scope.initBtn = {
        'active': false,
        'coords': null
    };
    $scope.maxBtn = {
        'active': false,
        'coords': null
    };
    
    
    $scope.toggleInitBoxDraw = function() {
      if ($scope.initBtn.active) {
        $scope.initBtn.active = false;
        if(!$scope.$$phase) {
          $scope.$apply();
        }
        $scope.initBoxDrawCtrl.deactivate();
      } else {
        $scope.initBtn.active = true;
        $scope.initBoxDrawCtrl.activate();
        // deactivate other button
        $scope.maxBtn.active = false;
        $scope.maxBoxDrawCtrl.deactivate();
      }
    };
    
    $scope.toggleMaxBoxDraw = function() {
      if ($scope.maxBtn.active) {
        $scope.maxBtn.active = false;
        if(!$scope.$$phase) {
          $scope.$apply();
        }
        $scope.maxBoxDrawCtrl.deactivate();
      } else {
        $scope.maxBtn.active = true;
        $scope.maxBoxDrawCtrl.activate();
        // deactivate other button
        $scope.initBtn.active = false;
        $scope.initBoxDrawCtrl.deactivate();
      }
    };
    
    // event listener to prevent the drawing of multiple rectangles
    $scope.featureRemover = function(event) {
      event.object.removeAllFeatures();
    };
    
    initBoxLayer.events.register('beforefeatureadded',
        initBoxLayer, $scope.featureRemover);
    initBoxLayer.events.register('featureadded',
        initBoxLayer, $scope.toggleInitBoxDraw);
    
    maxBoxLayer.events.register('beforefeatureadded',
        maxBoxLayer, $scope.featureRemover);
    maxBoxLayer.events.register('featureadded',
        maxBoxLayer, $scope.toggleMaxBoxDraw);
    

    // event listener to get the current values of the box coords
    $scope.coordListener = function(event) {
      var geometry = event.feature.geometry;
      if (event.object.name === 'initial box') {
        $scope.initBtn.coords = geometry;
      } else if (event.object.name === 'maximal box') {
        $scope.maxBtn.coords = geometry;
      }
    };
    initBoxLayer.events.register('featureadded',
        initBoxLayer, $scope.coordListener);
    maxBoxLayer.events.register('featureadded',
        maxBoxLayer, $scope.coordListener);
    
    $scope.updateMap = function(){
      
      if ($scope.selectionMade()) {
        mappifyConceptsService.saveCurrentValues($scope);
      }
      var mappifyConcepts = mappifyConceptsService.getConcepts();
      
      // get lat/lon constraints
      var boundsEPSG4326  = $scope.maxBtn.coords.getBounds().clone()
      .transform(map.getProjection(), new OpenLayers.Projection("EPSG:4326"));
      var bounds = {
          latMax: boundsEPSG4326.top,
          latMin: boundsEPSG4326.bottom,
          lonMin: boundsEPSG4326.left,
          lonMax: boundsEPSG4326.right
      };
      
      for (var i = 0; i < mappifyConcepts.length; i++) {
        var concept = mappifyConcepts[i];
        if (concept.sponateQuery === null) {
          console.log('[WARN] concept ' + concept.name +
          ' has no saved SPONATE mapping. Skipping...');
          continue;
        }
        var newScope = $scope.$new();
        // hand everything over to a controller with an own scope which will
        // care about displaying of the markers and setting up the pop ups
        MarkerDisplayCtrl(newScope, $compile, sponateService, concept, bounds);
      }
    };
    
    
    /*
     * Mappify Concept handling
     * ========================================================================
     */
    $scope.sponateMapping = null;
    $scope.infoTemplate = null;
    $scope.sponateQuery = null;
    $scope.markerFilePath = null;
    
    $scope.createConcept = function() {
      mappifyConceptsService.addConcept();
    };
    
    $scope.deleteConcept = function() {
      mappifyConceptsService.deleteConcept($scope.selectedMappifyConcept);
      $scope.selectedMappifyConcept = null;
      $scope.$broadcast('mappify-concept-deleted');
    };
    
    $scope.$on('mappify-concept-selection-will-change', function() {
      mappifyConceptsService.saveCurrentValues($scope);
    });
    
    
    /*
     * debug
     * ========================================================================
     */
    $scope.dummyFn = function() {
      console.log('dummy function called');
    };
  });




var MarkerDisplayCtrl = function($scope, $compile, sponateService, concept, bounds) {  
  // constants
  var popupContainerHTMLClass = 'mappify-popup-container';

  var popUpReplacements = {};
  var markerClick = function (event) {
    if (this.popup === null) {
      this.popup = this.createPopup(this.closeBox);
      map.addPopup(this.popup);
      this.popup.show();
      var id = this.popup.div.getElementsByClassName(
          popupContainerHTMLClass)[0].id;
      // compile actual template
      var popupElem = $compile(
          '<div class="mappify-info-popup" onload="refresh()">' +
          $scope.concept.infoTemplate + '</div>')(popUpReplacements[id]);
      // and append it
      $scope.$apply(function() {
        jQuery('#' + id).append(popupElem);
      });
      
      this.popup.registerImageListeners();
      this.popup.updateSize();
    } else {
      this.popup.toggle();
    }
    currentPopup = this.popup;
    OpenLayers.Event.stop(event);
  };
  
  $scope.concept = concept;
  // inject lat/lon constraints
  var closeBracePos = $scope.concept.sponateQuery.lastIndexOf('}');
  var length = $scope.concept.sponateQuery.length;
  var query = $scope.concept.sponateQuery.slice(0, closeBracePos) +
      ' FILTER( (xsd:float(?lat) < ' + bounds.latMax + ') && ' +
               '(xsd:float(?lat) > ' + bounds.latMin + ') && ' +
               '(xsd:float(?long) < ' + bounds.lonMax + ') && ' +
               '(xsd:float(?long) > ' + bounds.lonMin + ')' +
      ')' + $scope.concept.sponateQuery.slice(closeBracePos, length);
  
  // FIXME: this is a hack due to
  // https://github.com/GeoKnow/Jassa/issues/2
  if (sponateService[$scope.concept.id] !== undefined) {
    delete sponateService[$scope.concept.id];
    var service = sponateService.service;
    var prefixes = sponateService.context.getPrefixMap().getJson();
    sponateService.initialize(service, prefixes);
  }
  
  var sponateMapping = null;
  eval('sponateMapping = ' + $scope.concept.sponateMapping + ';');
  
  sponateService.addMap({
    'name' : $scope.concept.id,
    'template' : [ sponateMapping ],
    'from' : query
  });
  
  var res = sponateService[$scope.concept.id].find().asList(false);
  
  res.done(function(queryResults) {
    // general setup of markers parameters
    var size = new OpenLayers.Size(40,40);
    var offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
    var popupSize = new OpenLayers.Size(550,550);
    var layerName = 'mappify-markers-' + $scope.concept.id;
    var markerLayers =
        map.getLayersByName('mappify-markers-' + $scope.concept.id);
    for (var i = 0; i < markerLayers.length; i++) {
      var layer = markerLayers[i];
      map.removeLayer(layer);
    }
    // FIXME: popup layer needs to be deleted, too!!! 
    var markers = new OpenLayers.Layer.Markers(layerName);
    map.addLayer(markers);
    
    for (var i = 0; i < queryResults.length; i++) {
      var res = queryResults[i];
      var long = res.long;
      var lat = res.lat;
      var longLat = new OpenLayers.LonLat(long, lat).transform(
          new OpenLayers.Projection('EPSG:4326'),
          new OpenLayers.Projection('EPSG:900913'));
      
      var feature = new OpenLayers.Feature(markers, longLat);

      feature.closeBox = true;
      feature.popupClass = OpenLayers.Class(
          OpenLayers.Popup.FramedCloud, {
              'autoSize': true,
              'maxSize': popupSize
      });

      feature.data.overflow = 'auto';
      var dummyScope = $scope.$new();
      jQuery.extend(dummyScope, res);

      var popupId = 'mappify-' + $scope.concept.id + '-' + i;
      popUpReplacements[popupId] = dummyScope;
      feature.data.popupContentHTML =
          '<div id="' + popupId + '" class="' + popupContainerHTMLClass + '"/>';
      
      if ($scope.concept.markerIconPath === null) {
        // fallback marker
        var markerIconPath = 'bower_components/openlayers/img/marker.png';
        var size = new OpenLayers.Size(30,30);
        var offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
        feature.data.icon = new OpenLayers.Icon(markerIconPath, size, offset);
        
      } else {
        feature.data.icon = new OpenLayers.Icon(
            $scope.concept.markerIconPath, size, offset);
      }
      
      var marker = feature.createMarker();
      marker.events.register('mousedown', feature, markerClick);
      markers.addMarker(marker);
    }
  });
};
