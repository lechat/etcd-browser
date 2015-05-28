angular.module('mc.resizer', []).directive('resizer', function($document) {

	return function($scope, $element, $attrs) {

		$element.on('mousedown', function(event) {
			event.preventDefault();

                        $($attrs.resizer).css({cursor:'move'});
			$document.on('mousemove', mousemove);
			$document.on('mouseup', mouseup);
		});

		function mousemove(event) {
		    var x = event.pageX;
		    if ($attrs.resizerMax && x > $attrs.resizerMax) {
			x = parseInt($attrs.resizerMax);
		    }

		    $($attrs.resizerLeft).css({
			width: x + 'px'
		    });
		    $($attrs.resizerRight).css({
			left: (x + parseInt($attrs.resizerWidth)) + 'px'
		    });
		}

		function mouseup() {
                    $($attrs.resizer).css({cursor:'auto'});
		    $document.unbind('mousemove', mousemove);
		    $document.unbind('mouseup', mouseup);
		}
	};
});
