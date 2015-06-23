// Get JSON data
treeJSON = d3.json("data.json", function(error, treeData) {

    // Calculate total nodes, max label length
    var totalNodes = 0;
    var maxLabelLength = 0;

    // variables for drag/drop
    var selectedNode = null;
    var draggingNode = null;

    // panning variables
    var panSpeed = 200;
    var panBoundary = 20; // Within 20px from edges will pan when dragging.

    // Misc. variables
    var i = 0;
    var duration = 750;
    var root;

    // size of the diagram
    var viewerWidth = $(document).width();
    var viewerHeight = $(document).height();

    var tree = d3.layout.tree()
        .size([viewerHeight, viewerWidth]);

    // define a d3 diagonal projection for use by the node paths later on.
    var diagonal = d3.svg.diagonal()
        .projection(function(d) {
            return [d.y, d.x];
        });

    var clickedOnce = false;
    var timer;
    var flagtoolTip = false;
    var flagselect = false;

    // A recursive helper function for performing some setup by walking through all nodes

    function visit(parent, visitFn, childrenFn) {
        if (!parent) return;

        visitFn(parent);

        var children = childrenFn(parent);
        if (children) {
            var count = children.length;
            for (var i = 0; i < count; i++) {
                visit(children[i], visitFn, childrenFn);
            }
        }
    }

    // Call visit function to establish maxLabelLength
    visit(treeData, function(d) {
        totalNodes++;
        maxLabelLength = Math.max(d.name.length, maxLabelLength);

    }, function(d) {
        return d.children && d.children.length > 0 ? d.children : null;
    });


    // sort the tree according to the node names

    function sortTree() {
        tree.sort(function(a, b) {
            return b.name.toLowerCase() < a.name.toLowerCase() ? 1 : -1;
        });
    }
    // Sort the tree initially incase the JSON isn't in a sorted order.
    sortTree();

    // TODO: Pan function, can be better implemented.

    function pan(domNode, direction) {
        var speed = panSpeed;
        if (panTimer) {
            clearTimeout(panTimer);
            translateCoords = d3.transform(svgGroup.attr("transform"));
            if (direction == 'left' || direction == 'right') {
                translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
                translateY = translateCoords.translate[1];
            } else if (direction == 'up' || direction == 'down') {
                translateX = translateCoords.translate[0];
                translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
            }
            scaleX = translateCoords.scale[0];
            scaleY = translateCoords.scale[1];
            scale = zoomListener.scale();
            svgGroup.transition().attr("transform", "translate(" + translateX + "," + translateY + ")scale(" + scale + ")");
            d3.select(domNode).select('g.node').attr("transform", "translate(" + translateX + "," + translateY + ")");
            zoomListener.scale(zoomListener.scale());
            zoomListener.translate([translateX, translateY]);
            panTimer = setTimeout(function() {
                pan(domNode, speed, direction);
            }, 50);
        }
    }

    // Define the zoom function for the zoomable tree

    function zoom() {
        svgGroup.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    }


    // define the zoomListener which calls the zoom function on the "zoom" event constrained within the scaleExtents
    var zoomListener = d3.behavior.zoom().scaleExtent([0.1, 3]).on("zoom", zoom);


    // define the baseSvg, attaching a class for styling and the zoomListener
    var baseSvg = d3.select("#tree-container").select("svg")
        .attr("width", viewerWidth)
        .attr("height", viewerHeight)
        .call(zoomListener)
        .on("dblclick.zoom", null);


    // Helper functions for collapsing and expanding nodes.

    function collapse(d) {
        if (d.children) {
            d._children = d.children;
            d._children.forEach(collapse);
            d.children = null;
        }
    }

    function expand(d) {
        if (d._children) {
            d.children = d._children;
            d.children.forEach(expand);
            d._children = null;
        }
    }

    var overCircle = function(d) {
        selectedNode = d;
        updateTempConnector();
    };
    var outCircle = function(d) {
        selectedNode = null;
        updateTempConnector();
    };


    // Function to center node when clicked/dropped so node doesn't get lost when collapsing/moving with large amount of children.
    function centerNode(source) {
        scale = zoomListener.scale();
        x = -source.y0;
        y = -source.x0;
        x = x * scale + viewerWidth / 2;
        y = y * scale + viewerHeight / 2;
        d3.select('g').transition()
            .duration(duration)
            .attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
        zoomListener.scale(scale);
        zoomListener.translate([x, y]);
    }

    function toggleAll(d) {
        if (d.children)
        {
            //console.log(">> " + d.name);
            d.children.forEach(toggleAll);
            if(d.status != "red" || d["level"] == "L" || d["node"] == "arc")
            toggleChildren(d);
        }
    }

    // Toggle children function

    function toggleChildren(d) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else if (d._children) {
            d.children = d._children;
            d._children = null;
        }
        return d;
    }

    function openNode(d){
        if (d._children){
            d.children = d._children;
            d._children = null;
        }
        return d;
    }

    function closeNode(d){
        if (d.children){
            d._children = d.children;
            d.children = null;
        }
        return d;
    }

    // Toggle children on click.
    function click(d) {
        clickedOnce = false;
        //if (d3.event.defaultPrevented) return; // click suppressed
        d = toggleChildren(d);
        update(d);
        centerNode(d);
    }


    function update(source) {
        if (flagselect){
            func_dblclick(source);
        }else{
            if (toolTip != undefined)
                exitTooltip(source);
        }
        // Compute the new height, function counts total children of root node and sets tree height accordingly.
        // This prevents the layout looking squashed when new nodes are made visible or looking sparse when nodes are removed
        // This makes the layout more consistent.
        var levelWidth = [1];
        var childCount = function(level, n) {

            if (n.children && n.children.length > 0) {
                if (levelWidth.length <= level + 1) levelWidth.push(0);

                levelWidth[level + 1] += n.children.length;
                n.children.forEach(function(d) {
                    childCount(level + 1, d);
                });
            }
        };
        childCount(0, root);
        var newHeight = d3.max(levelWidth) * 25; // 25 pixels per line
        tree = tree.size([newHeight, viewerWidth]);

        // Compute the new tree layout.
        var nodes = tree.nodes(root).reverse(),
            links = tree.links(nodes);

        // Set widths between levels based on maxLabelLength.
        nodes.forEach(function(d) {
            d.y = (d.depth * (maxLabelLength * 10)); //maxLabelLength * 10px
            // alternatively to keep a fixed scale one can set a fixed depth per level
            // Normalize for fixed-depth by commenting out below line
            // d.y = (d.depth * 500); //500px per level.
        });

        // Update the nodes…
        node = svgGroup.selectAll("g.node")
            .data(nodes, function(d) {
                return d.id || (d.id = ++i);
            });

        // Enter any new nodes at the parent's previous position.
        var nodeEnter = node.enter().append("g")
        //    .call(dragListener)
            .attr("class", "node")
            .attr("transform", function(d) {
                return "translate(" + source.y0 + "," + source.x0 + ")";
            })
            .on("click", function(d){
                if (clickedOnce) {
                    func_dblclick(d);
                } else {
                    var tmpd = d
                    timer = setTimeout(function() {
                        click(tmpd);
                        single_click(tmpd);
                    }, 300);
                    clickedOnce = true;
                }
            });


        nodeEnter.append("circle")
            .attr('class', 'nodeCircle')
            .attr("r", 0)
            .style("fill", function(d) {
                return d.status ? d.status : "#lightsteelblue";
            });

        nodeEnter.append("text")
            .attr("x", function(d) {
                return d.children || d._children ? -10 : 10;
            })
            .attr("dy", ".35em")
            .attr('class', 'nodeText')
            .attr("text-anchor", function(d) {
                return d.children || d._children ? "end" : "start";
            })
            .text(function(d) {
                return d.name;
            })
            .style("fill-opacity", 0);

        // phantom node to give us mouseover in a radius around it
        nodeEnter.append("circle")
            .attr('class', 'ghostCircle')
            .attr("r", 30)
            .attr("opacity", 0.2) // change this to zero to hide the target area
        .style("fill", "red")
            //.attr('pointer-events', 'mouseover')
            .on("mouseover", function(node) {
                overCircle(node);
            })
            .on("mouseout", function(node) {
                outCircle(node);
            });

        // Update the text to reflect whether node has children or not.
        node.select('text')
            .attr("x", function(d) {
                return d.children || d._children ? -10 : 10;
            })
            .attr("text-anchor", function(d) {
                return d.children || d._children ? "end" : "start";
            })
            .text(function(d) {
                return d.name;
            });

        // Change the circle fill depending on whether it has children and is collapsed
        node.select("circle.nodeCircle")
            .attr("r", 4.5)
            .style("fill", function(d) {
                return d.status ? d.status : "#fff";
            });

        // Transition nodes to their new position.
        var nodeUpdate = node.transition()
            .duration(duration)
            .attr("transform", function(d) {
                return "translate(" + d.y + "," + d.x + ")";
            });

        // Fade the text in
        nodeUpdate.select("text")
            .style("fill-opacity", 1);

        // Transition exiting nodes to the parent's new position.
        var nodeExit = node.exit().transition()
            .duration(duration)
            .attr("transform", function(d) {
                return "translate(" + source.y + "," + source.x + ")";
            })
            .remove();

        nodeExit.select("circle")
            .attr("r", 0);

        nodeExit.select("text")
            .style("fill-opacity", 0);

        // Update the links…
        var link = svgGroup.selectAll("path.link")
            .data(links, function(d) {
                return d.target.id;
            });

        // Enter any new links at the parent's previous position.
        link.enter().insert("path", "g")
            .attr("class", "link")
            .attr("d", function(d) {
                var o = {
                    x: source.x0,
                    y: source.y0
                };
                return diagonal({
                    source: o,
                    target: o
                });
            });

        // Transition links to their new position.
        link.transition()
            .duration(duration)
            .attr("d", diagonal);

        // Transition exiting nodes to the parent's new position.
        link.exit().transition()
            .duration(duration)
            .attr("d", function(d) {
                var o = {
                    x: source.x,
                    y: source.y
                };
                return diagonal({
                    source: o,
                    target: o
                });
            })
            .remove();

        // Stash the old positions for transition.
        nodes.forEach(function(d) {
            d.x0 = d.x;
            d.y0 = d.y;
        });


        function single_click(d){
            if (flagtoolTip){
                exitTooltip(d);
            }
        }

        function func_dblclick(d){
            if (!flagtoolTip){
                node_ontoolTip(d);
            }else if (tmp != d){
                exitTooltip(d)
                node_ontoolTip(d);
            }else{
                exitTooltip(d);
            }
            tmp = d;
            clearTimeout(timer);
            clickedOnce = false;
        }

        function toolTip_Init(){
            toolTip = svgGroup.append("rect")
                .attr("id", "toolTip")
                .attr("class", "tooltip")
                .attr("width", "800")
                .attr("height", "200")
                .style("opacity", "0");

            tipHead = svgGroup.append("text")
                .attr("id", "tipHead")
                .attr("class", "tiphead")
                .style("opacity", "0");

            tipInfo = svgGroup.append("text")
                .attr("id", "tipInfo")
                .attr("class", "tiphead")
                .style("opacity", "0");

            flagtoolTip = true;
        }

        function exitTooltip(){
            toolTip.transition()
                .duration(200)
                .style("opacity", "0.1")
                .remove();
            tipHead.transition()
                .duration(200)
                .style("opacity", "0.1")
                .remove();
            tipInfo.transition()
                .duration(200)
                .style("opacity", "0.1")
                .remove();
            copyButton.transition()
                .duration(200)
                .style("opacity", "0.2")
            copyLink.transition()
                .duration(200)
                .style("opacity", "0");

            flagtoolTip = false;
        }

        function node_ontoolTip(d) {
            toolTip_Init()
            toolTip.transition()
                .duration(200)
                .style("opacity", "1")
                .style("position", "absolute")
                .attr("x", d.y)
                .attr("y", d.x)
                .attr("stat", "on");

            if (d.status == "red"){
                toolTip.style("fill", "#FF7575")
            }else if (d.status == "orange"){
                toolTip.style("fill", "orange")
            }else{
                toolTip.style("fill", "#79FF79")
            }

            tipHead.transition()
                .duration(200)
                .attr("x", (d.y+80))
                .attr("y", (d.x+10))
                .attr("dy", ".35em")
                .style("opacity","1")
                .text(function(){
                    if (d['node'] == 'corner' || d['node'] == 'origin' || d['node'] == 'Passed'){
                        return d['name']
                    }else{
                        return d['head']
                    }
                });

            if (d.node != "inst"){
                var position = {
                    x1:(d.y+200),
                    y1:(d.x+40),
                    x2:(d.y+600),
                    y2:(d.x+40),
                    x3:(d.y+200),
                    y3:(d.x+100),
                    x4:(d.y+600),
                    y4:(d.x+100),
                    x5:(d.y+400),
                    y5:(d.x+150)
                };
                var data1 = ["PerDone", "PerPass","MAX Mem","CPU Time","CMD"]
                var data2 = [d["PerDone"], d["PerPass"],d["MAX_Memory"],d["CPU_TIME"], d["CMD"]]
                var link = d["CMD"]

                for (head in data1){
                    tipInfo.append("tspan")
                        .attr("id", "head");
                }

                for (head in data2){
                    tipInfo.append("tspan")
                        .attr("id", "info");
                }

                tipInfo.transition()
                    .duration(200)
                    .attr("x", (d.y+400))
                    .attr("y", (d.x+30))
                    .attr("dy", ".35em")
                    .style("opacity","1")

                tipInfo.selectAll("#head")
                    .data(data1)
                    .attr("x", function(d,i){
                        var p_x = ("x"+(i+1));
                        return position[p_x]
                    })
                    .attr("y",function(d,i){
                        var p_y = ("y"+(i+1));
                        return position[p_y];
                    })
                    .text(function(d){
                        return d;
                        })

                tipInfo.selectAll("#info")
                    .data(data2)
                    .attr("x", function(d,i){
                        var p_x = ("x"+(i+1));
                        if (i == 4){
                            return (position[p_x]-250);
                        }else{
                            return (position[p_x]);
                        }
                    })
                    .attr("y", function(d,i){
                        var p_y = ("y"+(i+1));
                        return (position[p_y]+20);
                    })
                    .text(function(d,i){
                        if (d != undefined){
                            return d;
                        }else{
                            return "No this item!!"
                        }
                    })
            }else{
                var position = {
                    x1:(d.y+200),
                    y1:(d.x+40),
                    x2:(d.y+600),
                    y2:(d.x+40),
                    x3:(d.y+400),
                    y3:(d.x+100),
                    x4:(d.y+400),
                    y4:(d.x+160),
                    x5:(d.y+400),
                    y5:(d.x+240)
                };
                var data1 = ["Max Memory", "CPU Time", "ERROR", "Log file", 'CMD'];
                var data2 = [d["MAX_Memory"], d["CPU_TIME"], d["Error"], d["Log1"], d["Log2"], d['CMD']];
                var link = d["Log1"] + d["Log2"];

                toolTip.attr("width", "900")
                    .attr("height", "300")

                for (head in data1){
                    tipInfo.append("tspan")
                        .attr("id", "head");
                }

                for (head in data2){
                    tipInfo.append("tspan")
                        .attr("id", "info");
                }

                tipInfo.transition()
                    .duration(200)
                    .attr("x", (d.y+400))
                    .attr("y", (d.x+30))
                    .attr("dy", ".35em")
                    .style("opacity","1")


                tipInfo.selectAll("#head")
                    .data(data1)
                    .attr("x", function(d,i){
                        var p_x = ("x"+(i+1));
                        return position[p_x];
                    })
                    .attr("y",function(d,i){
                        var p_y = ("y"+(i+1));
                        return position[p_y];
                    })
                    .text(function(d){
                        return d;
                        })

                tipInfo.selectAll("#info")
                    .data(data2)
                    .attr("x", function(d,i){
                        var p_x = ("x"+(i+1));
                        if (i < 2){
                            return position[p_x];
                        }else if (i == 2){
                            return (position[p_x]-350);
                        }else{
                            return (position["x4"]-380);
                        }
                    })
                    .attr("y", function(d,i){
                        var p_y = ("y"+(i+1));
                        if (i < 4){
                            return (position[p_y]+30);
                        }else if (i==4){
                            return (position["y4"]+50);
                        }else{
                            return (position["y5"]+30);
                        }
                    })
                    .text(function(d,i){
                        if (d != undefined){
                            return d;
                        }else{
                            return "No this item!!"
                        }
                    })

            }

            copyButton.transition()
                .duration(200)
                .style("opacity", "1")


            copyLink.transition()
                .duration(200)
                .style("opacity", "1")
                .text(function(d){
                    return link
                })
        }

    }

    // Append a group which holds all nodes and which the zoom Listener can act upon.
    var svgGroup = baseSvg.select("g");

    var toolTip
    var copyButton = d3.select(document.getElementById("copyButton"))
        .style("opacity", "0.2")
        .on("click", copytoclipboard)

    function copytoclipboard(){
        console.log(1)
        var clip = new ZeroClipboard.Client();

        clip.addEventListener('mousedown',function() {
            clip.setText("test test");
            console.log(1)
        });
        clip.addEventListener('complete',function(client,text) {
            alert('copied: ' + text);
        });
        //glue it to the button
        clip.glue('copyButton');
    }

    var copyLink = d3.select(document.getElementById("copyLink")).style("opacity", "0")


    // Define the root
    root = treeData;
    root.x0 = viewerHeight / 2;
    root.y0 = 0;

    // Recursively collapse nodes
    root.children.forEach(toggleAll);

    // Layout the tree initially and center on the root node.
    update(root);
    centerNode(root);



    // Treatement of the draw down menus
    var selectitems = d3.select("form").style("opacity", ".8")
    var selectCorner = d3.select(document.getElementById("corner")).on("change", func_selectCor)
    var selectPkg = d3.select(document.getElementById("package")).on("change", func_selectPkg)
    var selectArc = d3.select(document.getElementById("arc")).on("change", func_selectArc)
    var selectInstC = d3.select(document.getElementById("instclass")).on("change", func_selectInstC)
    var selectGroup1 = d3.select(document.getElementById("igroup1")).on("change", func_selectgroup1)
    var selectGroup2 = d3.select(document.getElementById("igroup2")).on("change", func_selectgroup2)
    var selectInstance = d3.select(document.getElementById("instance")).on("change", func_selectInst)

    var selectedcorner, selectedpkg, selectedarc, selectedinstc, selectedg1, fatherNode

    var option = selectCorner.append("option")
        .attr("value", "none")
        .text("")
    for (corner in root["children"]){
        //console.log(treeData["children"][corner]["name"])
        newval = root["children"][corner]["name"];
        option = selectCorner.append("option")
            .attr("value", newval)
            .text(newval)
    }
    var origine = root;

    function func_selectCor(){
        //console.log(d3.event.target.value)
        if (d3.event.target.value != "none"){
            openNode(root);
            selectedCname = d3.event.target.value;
            selectPkg.selectAll("option").remove();
            selectArc.selectAll("option").remove();
            selectInstC.selectAll("option").remove();
            selectGroup1.selectAll("option").remove();
            selectGroup2.selectAll("option").remove();
            selectInstance.selectAll("option").remove();
            flagselect = false;
            origine.children.forEach(function(d){
                if (d["name"] == selectedCname){
                    //click(d)
                    d = openNode(d)
                    update(d);
                    centerNode(d)
                    if (d["name"] != "Corner_Passed"){
                        option = selectPkg.append("option")
                            .attr("value", "none")
                            .text("");
                        for (pkg in d.children){
                            newval = d["children"][pkg]["name"];
                            option = selectPkg.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                    }else{
                        selectCorner.selectAll("option").remove();
                        option = selectCorner.append("option")
                            .attr("value", "none")
                            .text("");
                        for (subcorner in d.children){
                            newval = d["children"][subcorner]["name"];
                            option = selectCorner.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                        origine = d;
                    }
                    selectedcorner = d;
                    d.children.forEach(function(d){
                        sonNode = closeNode(d);
                        update(sonNode);
                        centerNode(selectedcorner);
                    })
                }else{
                    if (d.children){
                        d = closeNode(d)
                        update(d);
                    }
                }
            })
        }else{
            selectPkg.selectAll("option").remove();
            selectArc.selectAll("option").remove();
            selectInstC.selectAll("option").remove();
            selectGroup1.selectAll("option").remove();
            selectGroup2.selectAll("option").remove();
            selectInstance.selectAll("option").remove();
            flagselect = false;
            openNode(root);
            root.children.forEach(function(d){
                sonNode = closeNode(d);
                update(sonNode);
                centerNode(selectedcorner);
            })
            update(root);
            centerNode(root);
        }
    }

    function func_selectPkg(){
        if (d3.event.target.value != "none"){
            pkgselected = d3.event.target.value;
            selectArc.selectAll("option").remove();
            selectInstC.selectAll("option").remove();
            selectGroup1.selectAll("option").remove();
            selectGroup2.selectAll("option").remove();
            selectInstance.selectAll("option").remove();
            flagselect = false;
            selectedcorner.children.forEach(function(d){
                if (d["name"] == pkgselected){
                    console.log(0)
                    //click(d)
                    d = openNode(d)
                    update(d);
                    centerNode(d)
                    if (d["name"] != "Pkg_Passed"){
                        option = selectArc.append("option")
                            .attr("value", "none")
                            .text("");
                        for (arc in d.children){
                            newval = d["children"][arc]["name"];
                            option = selectArc.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                    }else{
                        selectPkg.selectAll("option").remove();
                        option = selectPkg.append("option")
                            .attr("value", "none")
                            .text("");
                        for (subpkg in d.children){
                            newval = d["children"][subpkg]["name"];
                            option = selectPkg.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                        selectedcorner = d
                    }
                    selectedpkg = d
                    d.children.forEach(function(d){
                        sonNode = closeNode(d);
                        update(sonNode);
                        centerNode(selectedpkg);
                    })
                }else{
                    if (d.children){
                        d = closeNode(d)
                        update(d);
                    }
                }
            })
        }
    }

    function func_selectArc(){
        if (d3.event.target.value != "none"){
            arcselected = d3.event.target.value;
            selectInstC.selectAll("option").remove();
            selectGroup1.selectAll("option").remove();
            selectGroup2.selectAll("option").remove();
            selectInstance.selectAll("option").remove();
            flagselect = false;
            selectedpkg.children.forEach(function(d){
                if (d["name"] == arcselected){
                    //click(d)
                    d = openNode(d)
                    update(d);
                    centerNode(d)
                    if (d["name"] != "Arc_Passed"){
                        option = selectInstC.append("option")
                            .attr("value", "none")
                            .text("");
                        for (instc in d.children){
                            newval = d["children"][instc]["name"];
                            option = selectInstC.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                    }else{
                        selectArc.selectAll("option").remove();
                        option = selectArc.append("option")
                            .attr("value", "none")
                            .text("");
                        for (subarc in d.children){
                            newval = d["children"][subarc]["name"];
                            option = selectArc.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                        selectedpkg = d
                    }
                    selectedarc = d
                    d.children.forEach(function(d){
                        sonNode = closeNode(d);
                        update(sonNode);
                        centerNode(selectedarc);
                    })
                }else{
                    if (d.children){
                        d = closeNode(d)
                        update(d);
                    }
                }
            })
        }
    }

    function func_selectInstC(){
        if (d3.event.target.value != "none"){
            instcselected = d3.event.target.value;
            selectGroup1.selectAll("option").remove();
            selectGroup2.selectAll("option").remove();
            selectInstance.selectAll("option").remove();
            flagselect = false;
            selectedarc.children.forEach(function(d){
                if (d["name"] == instcselected){
                    //click(d)
                    d = openNode(d)
                    update(d);
                    centerNode(d)
                    if (d["name"] != "InstC_Passed"){
                        option = selectGroup1.append("option")
                            .attr("value", "none")
                            .text("");
                        for (g1 in d.children){
                            newval = d["children"][g1]["name"];
                            option = selectGroup1.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                    }else{
                        selectInstC.selectAll("option").remove();
                        option = selectInstC.append("option")
                            .attr("value", "none")
                            .text("");
                        for (subinstc in d.children){
                            newval = d["children"][subinstc]["name"];
                            option = selectInstC.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                        selectedarc = d
                    }
                    selectedinstc = d
                    d.children.forEach(function(d){
                        sonNode = closeNode(d);
                        update(sonNode);
                        centerNode(selectedinstc);
                    })
                }else{
                    if (d.children){
                        d = closeNode(d)
                        update(d);
                    }
                }
            })
        }
    }

    function func_selectgroup1(){
        if (d3.event.target.value != "none"){
            g1selected = d3.event.target.value;
            selectGroup2.selectAll("option").remove();
            selectInstance.selectAll("option").remove();
            flagselect = false;
            selectedinstc.children.forEach(function(d){
                if (d["name"] == g1selected){
                    //click(d)
                    d = openNode(d)
                    update(d);
                    centerNode(d)
                    if (d["name"] != "InstGH_Passed"){
                        if (d.children[0]["node"] != "inst"){
                            option = selectGroup2.append("option")
                                .attr("value", "none")
                                .text("");
                            for (g2 in d.children){
                                newval = d["children"][g2]["name"];
                                option = selectGroup2.append("option")
                                    .attr("value", newval)
                                    .text(newval);
                            }
                            selectedg1 = d
                            d.children.forEach(function(d){
                                sonNode = closeNode(d);
                                update(sonNode);
                                centerNode(selectedg1);
                            })
                        }else{
                            option = selectInstance.append("option")
                                .attr("value", "none")
                                .text("");
                            for (inst in d.children){
                                newval = d["children"][inst]["name"];
                                option = selectInstance.append("option")
                                    .attr("value", newval)
                                    .text(newval);
                            }
                            fatherNode = d
                            d.children.forEach(function(d){
                                sonNode = closeNode(d);
                                update(sonNode);
                                centerNode(fatherNode);
                            })
                        }
                    }else{
                        selectGroup1.selectAll("option").remove();
                        option = selectGroup1.append("option")
                            .attr("value", "none")
                            .text("");
                        for (subg1 in d.children){
                            newval = d["children"][subg1]["name"];
                            option = selectGroup1.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                        selectedinstc = d
                        d.children.forEach(function(d){
                            sonNode = closeNode(d);
                            update(sonNode);
                            centerNode(fatherNode);
                        })
                    }
                }else{
                    if (d.children){
                        d = closeNode(d)
                        update(d);
                    }
                }
            })
        }
    }

    function func_selectgroup2(){
        if (d3.event.target.value != "none"){
            g2selected = d3.event.target.value;
            selectInstance.selectAll("option").remove();
            flagselect = false;
            selectedg1.children.forEach(function(d){
                if (d["name"] == g2selected){
                    //click(d)
                    d = openNode(d)
                    update(d);
                    centerNode(d)
                    if(d["name"] != "InstGL_Passed"){
                        option = selectInstance.append("option")
                            .attr("value", "none")
                            .text("");
                        for (inst in d.children){
                            newval = d["children"][inst]["name"];
                            option = selectInstance.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                    }else{
                        selectGroup2.selectAll("option").remove();
                        option = selectGroup2.append("option")
                            .attr("value", "none")
                            .text("");
                        for (subg2 in d.children){
                            newval = d["children"][subg2]["name"];
                            option = selectGroup2.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                        selectedg1 = d
                    }
                    fatherNode = d
                    d.children.forEach(function(d){
                        sonNode = closeNode(d);
                        update(sonNode);
                        centerNode(fatherNode);
                    })
                }else{
                    if (d.children){
                        d = closeNode(d)
                        update(d);
                    }
                }
            })
        }
    }


    function func_selectInst(){
        if (d3.event.target.value != "none"){
            instselected = d3.event.target.value;
            flagselect = false;
            fatherNode.children.forEach(function(d){
                if (d["name"] == instselected){
                    //click(d)
                    centerNode(d)
                    flagselect = true;
                    update(d)
                    if(d["name"] == "Inst_Passed"){
                        selectInstance.selectAll("option").remove();
                        option = selectInstance.append("option")
                            .attr("value", "none")
                            .text("");
                        for (inst in d.children){
                            newval = d["children"][inst]["name"];
                            option = selectInstance.append("option")
                                .attr("value", newval)
                                .text(newval);
                        }
                        fatherNode = d
                    }
                }else{
                    if (d.children){
                        d = closeNode(d)
                        update(d);
                    }
                }
            })
        }
    }




});
