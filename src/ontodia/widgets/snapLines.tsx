import * as React from 'react';

import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramModel } from '../diagram/model';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';
import { Dictionary } from '../data/model';
import { Element } from '../diagram/elements';

export const MAGNET_RADIUS = 5;

export interface SnapLine {
    orientation: 'vertical' | 'horizontal';
    value: number;
}

export interface SnapLinesProps extends PaperWidgetProps {
    view: DiagramView;
    model: DiagramModel;
}

export class SnapLines extends React.Component<SnapLinesProps, void> {
    private readonly listener = new EventObserver();

    private model: DiagramModel;
    private view: DiagramView;

    private indexMap: Dictionary<SnapLine[]> = {};
    private xLinesCache: string[][];
    private yLinesCache: string[][];

    private snapLines: SnapLine[] = [];

    constructor(props: SnapLinesProps) {
        super(props);

        this.model = props.model;
        this.view = props.view;

        this.subscribeOnEvents();
    }

    render() {
        if (this.snapLines.length > 0) {
            return <div className='ontodia-snap-lines'>{
                this.snapLines.map((snapLine, index) => {
                    const orientation = snapLine.orientation === 'horizontal';
                    const style: any = {};
                    style[orientation ? 'top' : 'left'] = `${snapLine.value}px`;

                    return <div
                        key={`snap-line-${index}`}
                        className={`ontodia-snap-line ${orientation ?
                            'ontodia-horizaontal-snap-line' : 'ontodia-vertical-snap-line'}`}
                        style={style}
                    ></div>;
                })
            }</div>;
        } else {
            return null;
        }
    }

    private subscribeOnEvents = () => {
        this.listener.listen(this.model.events, 'elementEvent', ({key, data}) => {
            if (key !== 'changePosition') { return; }
            this.onPositionChanged(data.changePosition.source);
            this.forceUpdate();
        });
        this.listener.listen(this.model.events, 'changeCells', ({source}) => {
            this.updateGrid();
        });
    }

    private magnet = (element: Element): SnapLine[] => {
        const id = element.id;
        const elementLines = this.getSnapLinesOfElement(element);

        const snapLines: SnapLine[] = [];
        for (let i = 0; i < MAGNET_RADIUS && snapLines.length === 0; i++) {
            for (const line of elementLines) {
                const cache = this.getCache(line.orientation);
                if (cache[line.value - i]) {
                    snapLines.push({ orientation: line.orientation, value: line.value - i });
                }
            }
        }

        return snapLines;
    }

    private onPositionChanged = (element: Element) => {
        this.eraseFromCache(element);
        this.snapLines = this.magnet(element);
        this.putInCache(element);
    }

    private updateGrid = () => {
        this.indexMap = {};
        this.xLinesCache = [];
        this.yLinesCache = [];

        for (const element of this.model.elements) {
            this.putInCache(element);
        }
    }

    private getSnapLinesOfElement(element: Element): SnapLine[] {
        const size = element.size;
        const position = element.position;

        return [
            { orientation: 'vertical', value: position.x },
            { orientation: 'vertical', value: position.x + size.width / 2 },
            { orientation: 'vertical', value: position.x + size.width },
            { orientation: 'horizontal', value: position.y },
            { orientation: 'horizontal', value: position.y + size.height / 2 },
            { orientation: 'horizontal', value: position.y + size.height }
        ];
    }

    private putInCache = (element: Element) => {
        const id = element.id;
        if (this.indexMap[id]) {
            this.eraseFromCache(element);
        }

        this.indexMap[id] = this.getSnapLinesOfElement(element);

        for (const sLine of this.indexMap[id]) {
            const value = sLine.value;
            const cache = this.getCache(sLine.orientation);

            if (!cache[value]) {
                cache[value] = [];
            }
            cache[value].push(id);
        }
    }

    private eraseFromCache = (element: Element) => {
        const id = element.id;
        if (this.indexMap[id]) {
            for (const sLine of this.indexMap[id]) {
                const value = sLine.value;
                const cache = this.getCache(sLine.orientation);

                if (cache[value]) {
                    const index = cache[value].indexOf(id);
                    if (index !== -1) {
                        if (cache[value].length === 1) {
                            delete cache[value];
                        } else {
                            cache[value].splice(index, 1);
                        }
                    }
                }

            }
        }
    }

    private getCache = (cacheType: ('vertical' | 'horizontal')): string[][] => {
        return cacheType === 'vertical' ? this.xLinesCache : this.yLinesCache;
    }

}
