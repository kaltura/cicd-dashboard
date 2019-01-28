
function arrow(fromId, toId){
    var from = $("#" + fromId);
    var to = $("#" + toId);

    if(!from.length) {
        console.error("Arrow source [" + fromId + "] not found");
        return;
    }
    if(!to.length) {
        console.error("Arrow destination [" + toId + "] not found");
        return;
    }
    
    // var $canvas = $("<canvas/>");
    // $canvas.attr("data-from", fromId);
    // $canvas.attr("data-to", toId);

    // $("body").append($canvas);
    // renderArrow($canvas);
}

function renderArrow($canvas){
    var headlen = 10;   // length of head in pixels

    var fromId = $canvas.attr("data-from");
    var toId = $canvas.attr("data-to");

    var $from = $("#" + fromId);
    var $src = $from.find(".arrow-src:visible").last();
    if($src.length) {
        $from = $src;
    }
    var $to = $("#" + toId);
    var $dest = $to.find(".arrow-dest:visible").first();
    if($dest.length) {
        $to = $dest;
    }

    var fromPosition = $from.offset();
    var fromX = fromPosition.left + ($from.width() / 2);
    var fromY = fromPosition.top + $from.height();
    
    var toPosition = $to.offset();
    var toX = toPosition.left + ($to.width() / 2);
    var toY = toPosition.top;
    var width = Math.abs(fromX - toX) + (headlen * 2);
    var height = toY - fromY;

    $canvas.css({
        top: fromY,
        left: (Math.min(fromX, toX) - headlen)
    });
    $canvas.attr({
        width: width,
        height: height + (headlen/2)
    });

    var x1 = (fromX > toX) ? width - headlen : headlen;
    var x2 = (fromX != toX) ? width - x1 : x1;

    var line = {
        strokeStyle: "#005bdf",
        strokeWidth: 4,
        rounded: true,
        endArrow: true,
        arrowRadius: headlen,
        arrowAngle: 90,
        x1: x1, y1: 0,
        x2: x2, y2: height - headlen
    };
    // console.log(line);

    var context = $canvas[0].getContext("2d");
    if(!context) {
        console.error("Canvas not found");
        return;
    }

    // context.clearRect(-10, -10, 1000, 1000);
    $canvas.drawLine(line);

    // var angle = Math.atan2(height, x2 - x1);

    // context.clearRect(0, 0, width, height + headlen);
    // context.lineWidth = 4;

    // context.beginPath();
    // context.strokeStyle = "#005bdf";
    // context.moveTo(x1, 0);
    // context.lineTo(x2, height);
    // context.lineTo(x2 - headlen * Math.cos(angle - Math.PI/6), height - headlen * Math.sin(angle - Math.PI/6));
    // context.moveTo(x2, height);
    // context.lineTo(x2 - headlen * Math.cos(angle + Math.PI/6), height - headlen * Math.sin(angle + Math.PI/6));
    // context.stroke();
}

function mainFlowArrows() {
    var headlen = 15;

    $(".main-flow").each(function(index, canvas) {
        $canvas = $(canvas);
        var center = $canvas.width() / 2;
        var line = {
            strokeStyle: "#005bdf",
            strokeWidth: 4,
            rounded: true,
            endArrow: true,
            arrowRadius: headlen,
            arrowAngle: 90,
            x1: center, y1: 0,
            x2: center, y2: 60
        };
        $canvas.attr("height", 70);
        $canvas.drawLine(line);
    });
}
