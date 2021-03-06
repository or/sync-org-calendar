function load(graphElementId) {
    var width;
    var height;
    var barSize = 20;
    var barPadding = 5;
    var dayHeight = 500;

    var svg = d3.select(graphElementId)
        .append("svg");
    var legendLayer = svg
        .append("g")
        .attr("transform", "translate(20,20)");

    var graph = svg.append("g")
        .attr("class", "graph");
    var data;
    var displayTypes;
    var hideTypes = {};

    var hour = d3.timeFormat("%H:%M");
    var clickedEntry = null;

    var x = d3.scaleTime();
    var y = d3.scaleTime();
    var xGridScale = d3.scaleTime();
    var yGridScale = d3.scaleTime();

    var baseDate = new Date();
    baseDate.setHours(0);
    baseDate.setMinutes(0);
    baseDate.setSeconds(0);

    var timeTicks = [];
    for (var i = 0; i <= 24; i += 2) {
        var tmp = new Date(baseDate);
        tmp.setHours(i);
        timeTicks.push(tmp);
    }

    var xAxis = d3.axisTop(x)
        .tickFormat(d3.timeFormat("%a %d %b"));
    var yAxis = d3.axisRight(y)
        .tickValues(timeTicks)
        .tickFormat(d3.timeFormat("%H:%M"));

    var xGrid = d3.axisBottom(xGridScale)
        .tickSize(0)
				.tickFormat("");
    var yGrid = d3.axisRight(yGridScale)
        .tickValues(timeTicks)
				.tickFormat("");

    var gX = svg.append("g")
        .attr("class", "axis axis--x");
    var gY = svg.append("g")
        .attr("class", "axis axis--y");

		var gGx = svg.append("g")
				.attr("class","x grid");
		var gGy = svg.append("g")
				.attr("class","y grid");

    var zoomK = 0;
    var minZoom = 0.25;
    var zoom = d3.zoom()
        .scaleExtent([minZoom, 40]);
    svg.call(zoom);


    var getWeeklyTicks = (xRange) => {
        var ticks = [];
        var current = new Date(xRange[0]);
        current.setHours(0);
        current.setMinutes(0);
        current.setSeconds(0);
        current.getMilliseconds(0);

        while (current.getDay() != 1) {
            current = new Date(current.getTime() - 12 * 60 * 60 * 1000);
            current.setHours(0);
            current.setMinutes(0);
            current.setSeconds(0);
            current.getMilliseconds(0);
        }

        while (current <= xRange[1]) {
            ticks.push(new Date(current));
            current = new Date(current.getTime() + (7 * 24 + 5) * 60 * 60 * 1000);
            current.setHours(0);
            current.setMinutes(0);
            current.setSeconds(0);
            current.getMilliseconds(0);
        }

        ticks.push(new Date(current));

        return ticks;
    };

    var getXTicks = (xRange, tickFrequency) => {
        var ticks = [];
        var current = new Date(xRange[0]);
        current.setHours(0);
        current.setMinutes(0);
        current.setSeconds(0);
        current.getMilliseconds(0);

        while (current.getDay() != 1) {
            current = new Date(current.getTime() - 12 * 60 * 60 * 1000);
            current.setHours(0);
            current.setMinutes(0);
            current.setSeconds(0);
            current.getMilliseconds(0);
        }

        while (current <= xRange[1]) {
            ticks.push(new Date(current));
            current = new Date(current.getTime() + (tickFrequency * 24 + 5) * 60 * 60 * 1000);
            current.setHours(0);
            current.setMinutes(0);
            current.setSeconds(0);
            current.getMilliseconds(0);
        }

        return ticks;
    };

    var buildXAxis = () => {
        if (d3.event != null && d3.event.transform != null) {
            zoomK = d3.event.transform.k;
        }

        var tickFrequency = Math.floor(Math.pow(2, 4 * (1 - zoomK)));
        if (tickFrequency < 1) {
            tickFrequency = 1;
        } else if (tickFrequency > 14) {
            tickFrequency = 14;
        }

        var xRange = [new Date(), new Date()];
        if (data != null) {
            xRange = [
                d3.min(data, (d) => {
                    return d3.timeDay.floor(d.start);
                }),
                d3.max(data, (d) => {
                    return d3.timeDay.ceil(d.end);
                })
            ];
        }

        xGrid.tickValues(getWeeklyTicks(xRange));
        xAxis.tickValues(getXTicks(xRange, tickFrequency));

        gX
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis);

        gX.selectAll("text")
            .attr("y", 0)
            .attr("x", 10)
            .attr("dy", "1.2em")
            .attr("transform", "rotate(-90)")
            .style("text-anchor", "start");

        xGrid
            .tickSize(height);
    };

    var zoomed = () => {
        graph.attr("transform", d3.event.transform);

        buildXAxis();
        gX.call(xAxis.scale(d3.event.transform.rescaleX(x)));
        gY.call(yAxis.scale(d3.event.transform.rescaleY(y)));
        gGx.call(xGrid.scale(d3.event.transform.rescaleX(xGridScale)));
        gGy.call(yGrid.scale(d3.event.transform.rescaleY(yGridScale)));
    };

    var div = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    var resize = () => {
        var element = document.getElementById(graphElementId.substring(1));
        width = element.clientWidth;
        height = element.clientHeight;

        svg
            .attr("width", width)
            .attr("height", height);
    };

    var timeline = {};

    var oldOnResize = d3.select(window).on("resize");

    var timeOffset = (t) => {
        var tmp = new Date(baseDate);
        tmp.setHours(t.getHours());
        tmp.setMinutes(t.getMinutes());
        return tmp;
    };

    var pickTypeColorMap = {
        calendar: d3.schemePaired[1],
        ops: d3.schemePaired[5],
        sprint: d3.schemePaired[3],
        extra: d3.schemePaired[7],
        personal: d3.schemePaired[9],
        unknown: d3.schemeCategory10[7]
    };
    var pickTypeColor = (d) => {
        return pickTypeColorMap[d];
    };

    var colorRange =  [
        "#1395ba",
        "#c02e1d",
        "#f16c20",
        "#ebc844",
        "#a2b86c",
        "#0d3c55",
    ];
    colorRange = colorRange.concat(d3.schemePastel1).concat(d3.schemePastel2);
    var colorIndex = 0;
    var colorMap = {};

    var pickColor = (d) => {
        var name = d.pretty;
        if (!(name in colorMap)) {
            colorMap[name] = colorIndex;
            colorIndex = (colorIndex + 1) % colorRange.length;
        }

        return colorRange[colorMap[name]];
    };

    d3.select(window).on("resize", () => {
        if (typeof(oldOnResize) != "undefined") {
            oldOnResize();
        }
        timeline.onResize();
    });

    timeline.onResize = () => {
        resize();
        timeline.update();
    };

    timeline.load = (path) => {
        console.log("load...");
        d3.json(path).then((rawData) => {
            console.log("received.");
            var typeMap = {};
            data = [];
            rawData.forEach((d) => {
                data = data.concat(d[1].map((e) => {
                    e.start = new Date(e.start);
                    e.end = new Date(e.end);
                    if (e.tags.includes("personal")) {
                        e.type = "personal";
                    } else if (e.filename.includes("calendar") || e.path.includes("Meetings")) {
                        e.type = "calendar";
                    } else if (e.filename.includes("oncall") || e.tags.includes("ops")) {
                        e.type = "ops";
                    } else if (e.name.indexOf("tt.") !== -1) {
                        e.type = "ops";
                    } else if (e.path.includes("Tasks")) {
                        e.type = "sprint";
                    } else if (e.path.includes("Extra")) {
                        e.type = "extra";
                    } else if (e.name.indexOf("sim.") !== -1) {
                        e.type = "sprint";
                    } else {
                        e.type = "unknown";
                    }

                    typeMap[e.type] = true;

                    e.pretty = e.name.replace(/\[\[[^\]]*\]\[([^\]]*)\]\]/g, "$1");
                    e.pretty = e.pretty.replace(/^(TODO|DONE|CANCELLED) /, "");

                    return e;
                }));
            });
            data = data.filter((d) => {
                if (hour(d.start) == "00:00") {
                    return false;
                }
                return true;
            });

            displayTypes = Object.keys(typeMap);

            console.log(data.length);

            timeline.update();
            timeline.updateData();
            svg.call(zoom.transform, d3.zoomIdentity);
        });
    };

    timeline.update = () => {
        if (data === null) {
            return;
        }

        var xRange = [
            d3.min(data, (d) => {
          	    return d3.timeDay.floor(d.start);
            }),
        	  d3.max(data, (d) => {
         		    return d3.timeDay.ceil(d.end);
            })
        ];

        var yRange = [new Date(baseDate), new Date(baseDate)];
        yRange[0].setHours(0);
        yRange[0].setMinutes(0);
        yRange[1].setHours(24);
        yRange[1].setMinutes(0);

        var timeline_width = (xRange[1] - xRange[0]) / 24 / 60 / 60 / 1000 * (barSize + barPadding);
        if (timeline_width < width) {
            timeline_width = width;
        }

        x
            .domain(xRange)
            .range([0, timeline_width]);

        y
            .domain(yRange)
            .range([0, dayHeight]);

        xGridScale
            .domain(xRange)
            .range([-(barSize + barPadding) / 2,
                    timeline_width - (barSize + barPadding) / 2]);
        yGridScale
            .domain(yRange)
            .range([0, dayHeight]);

        buildXAxis();
        gY
            .attr("transform", "translate(0,0)")
            .call(yAxis);

			  gGx.call(xGrid);
			  gGy.call(yGrid);

        yGrid.tickSize(width);

        zoom
            .translateExtent([[-width / 2 / minZoom, (-height + 30) / minZoom * (1 - minZoom)],
                              [timeline_width + width / 2 / minZoom, (height - 30) / minZoom]])
            .on("zoom", zoomed);
    };

    var getDataId = (d) => {
        return d;
    };

    var setFillOpacity = (d) => {
        if (d.pretty == clickedEntry) {
            return 1;
        }

        if (clickedEntry == null) {
            return 0.3;
        }

        return 0.3;
    };

    timeline.updateData = () => {
        var filteredData = data.filter((d) => {
            if (hideTypes[d.type]) {
                return false;
            }
            return true;
        });

        var rects = graph
            .selectAll("rect")
            .data(filteredData, getDataId);

        var transition = d3.transition()
            .duration(500)
            .ease(d3.easeLinear);

        rects
            .exit()
            .transition(transition)
            .style("opacity", 0)
            .remove();

        rects
            .enter()
            .append("rect")
            .attr("class", "times bar")
            .attr("x", (d) => {
                return x(d3.timeDay.floor(d.start)) - barSize / 2;
            })
            .attr("y", (d) => {
                return y(timeOffset(d.start));
            })
            .attr("width", (d) => {
                return barSize;
            })
            .attr("height", (d) => {
                return Math.max(0, y(timeOffset(d.end)) - y(timeOffset(d.start)));
            })
            .attr("rx", 3)
            .attr("ry", 3)
            .attr("stroke-width", 2)
            .attr("stroke", (d) => { return pickTypeColor(d.type); })
            .attr("fill-opacity", setFillOpacity)
            .attr("fill", pickColor)
            .style("opacity", 0)
            .on("mouseover", (d) => {
                div.transition()
                   .duration(200)
                   .style("opacity", 0.8);
                div.html(d.pretty + "<br/>" + d.type)
                   .style("left", (d3.event.pageX) + "px")
                   .style("top", (d3.event.pageY - 28) + "px");

                if (clickedEntry != d.pretty) {
                    clickedEntry = d.pretty;
                    graph.selectAll("rect")
                        .attr("fill-opacity", setFillOpacity);
                }
            })
            .on("mousemove", (d) => {
                div
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 28) + "px");
            })
            .on("mouseout", (d) => {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);

                if (clickedEntry !== null) {
                    clickedEntry = null;
                    graph.selectAll("rect")
                        .attr("fill-opacity", setFillOpacity);
                }
            })
            .transition(transition)
            .style("opacity", 1);

        legendLayer.selectAll(".legend").remove();

        var legend = legendLayer.selectAll(".legend")
            .data(displayTypes)
            .enter()
            .append("g")
            .attr("class", "legend clickable")
            .on("click", (d) => {
                if (d in hideTypes) {
                    delete hideTypes[d];
                } else {
                    hideTypes[d] = true;
                }
                timeline.updateData();
            })
            .attr("transform", (d, i) => {
                var x = i * 100;
                var y = 0;
                return "translate(" + x + "," + y + ")";
            })
        ;

        legend
            .append("rect")
            .attr("class", "checkbox-edge")
            .attr("width", 16)
            .attr("height", 16)
            .attr("stroke", (d) => { return pickTypeColor(d); })
            .attr("stroke-width", 2)
            .attr("fill", "white")
        ;

        legend
            .append("rect")
            .attr("class", "checkbox")
            .attr("transform", "translate(2,2)")
            .attr("width", 12)
            .attr("height", 12)
            .attr("stroke-width", 0)
            .attr("fill", (d) => {
                if (d in hideTypes) {
                    return "white";
                }
                return pickTypeColor(d);
            })
        ;

        legend.append("text")
            .attr("x", 25)
            .attr("y", 9)
            .attr("dy", ".35em")
            .text((d) => { return d; })
        ;
    };

    resize();

    timeline.load("./timeline.json");

    return timeline;
}
