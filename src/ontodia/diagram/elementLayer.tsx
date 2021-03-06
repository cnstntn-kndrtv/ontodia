import * as React from 'react';
import { findDOMNode } from 'react-dom';
import { hcl } from 'd3-color';

import { Property } from '../data/model';
import { TemplateProps } from '../customization/props';
import { Debouncer } from '../viewUtils/async';
import { createStringMap } from '../viewUtils/collections';
import { EventObserver, Unsubscribe } from '../viewUtils/events';

import { Element } from './elements';
import { uri2name } from './model';
import { DiagramView, RenderingLayer } from './view';

export interface Props {
    view: DiagramView;
    style: React.CSSProperties;
}

interface BatchUpdateItem {
    element: Element;
    node: HTMLDivElement;
}

export class ElementLayer extends React.Component<Props, void> {
    private readonly listener = new EventObserver();

    private batch = createStringMap<BatchUpdateItem>();
    private updateSizes = new Debouncer();

    private layer: HTMLDivElement;

    render() {
        const {view, style} = this.props;
        const models = view.model.elements;

        return <div className='ontodia-element-layer'
            ref={layer => this.layer = layer}
            style={style}>
            {models.map(model => <OverlayedElement key={model.id}
                model={model}
                view={view}
                onResize={this.updateElementSize}
                onRender={this.updateElementSize} />)}
        </div>;
    }

    componentDidMount() {
        const {view} = this.props;
        this.listener.listen(view.model.events, 'changeCells', () => this.forceUpdate());
        this.listener.listen(view.events, 'syncUpdate', ({layer}) => {
            if (layer !== RenderingLayer.ElementSize) { return; }
            this.updateSizes.runSynchronously();
        });
    }

    componentDidUpdate() {
        this.updateSizes.call(this.recomputeQueuedSizes);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.updateSizes.dispose();
    }

    private updateElementSize = (element: Element, node: HTMLDivElement) => {
        this.batch[element.id] = {element, node};
        this.updateSizes.call(this.recomputeQueuedSizes);
    }

    private recomputeQueuedSizes = () => {
        const batch = this.batch;
        this.batch = createStringMap<BatchUpdateItem>();

        // hasOwnProperty() check is unneccessary here because of `createStringMap`
        // tslint:disable-next-line:forin
        for (const id in batch) {
            const {element, node} = batch[id];
            const {clientWidth, clientHeight} = node;
            element.setSize({width: clientWidth, height: clientHeight});
        }

        this.props.view._onRenderDone();
    }
}

interface OverlayedElementProps {
    model: Element;
    view: DiagramView;
    onResize: (model: Element, node: HTMLDivElement) => void;
    onRender: (model: Element, node: HTMLDivElement) => void;
}

interface OverlayedElementState {
    readonly templateProps?: TemplateProps;
}

class OverlayedElement extends React.Component<OverlayedElementProps, OverlayedElementState> {
    private readonly listener = new EventObserver();
    private disposed = false;

    private typesObserver = new KeyedObserver(key => {
        const type = this.props.view.model.getClassesById(key);
        if (type) {
            type.events.on('changeLabel', this.rerenderTemplate);
            return () => type.events.off('changeLabel', this.rerenderTemplate);
        }
        return undefined;
    });

    private propertyObserver = new KeyedObserver(key => {
        const property = this.props.view.model.getPropertyById(key);
        if (property) {
            property.events.on('changeLabel', this.rerenderTemplate);
            return () => property.events.off('changeLabel', this.rerenderTemplate);
        }
        return undefined;
    });

    constructor(props: OverlayedElementProps) {
        super(props);
        this.state = {
            templateProps: this.templateProps(),
        };
    }

    private rerenderTemplate = () => {
        if (this.disposed) { return; }
        this.setState({templateProps: this.templateProps()});
    }

    render(): React.ReactElement<any> {
        const {model, view, onResize, onRender} = this.props;

        this.typesObserver.observe(model.data.types);
        this.propertyObserver.observe(Object.keys(model.data.properties));

        const template = view.getElementTemplate(model.data.types);

        const {x = 0, y = 0} = model.position;
        let transform = `translate(${x}px,${y}px)`;

        // const angle = model.get('angle') || 0;
        // if (angle) { transform += `rotate(${angle}deg)`; }

        return <div className='ontodia-overlayed-element'
            // set `element-id` to translate mouse events to paper
            data-element-id={model.id}
            style={{position: 'absolute', transform}}
            tabIndex={0}
            // resize element when child image loaded
            onLoad={() => onResize(model, findDOMNode(this) as HTMLDivElement)}
            onError={() => onResize(model, findDOMNode(this) as HTMLDivElement)}
            onClick={e => {
                if (e.target instanceof HTMLElement && e.target.localName === 'a') {
                    const anchor = e.target as HTMLAnchorElement;
                    view.onIriClick(anchor.href, model, e);
                }
            }}
            onDoubleClick={() => {
                model.setExpanded(!model.isExpanded);
            }}
            ref={node => {
                if (!node) { return; }
                onRender(model, node);
            }}>
            {React.createElement(template, this.state.templateProps)}
        </div>;
    }

    componentDidMount() {
        const {model, view} = this.props;
        this.listener.listen(view.events, 'changeLanguage', this.rerenderTemplate);
        this.listener.listen(model.events, 'changeData', this.rerenderTemplate);
        this.listener.listen(model.events, 'changeExpanded', this.rerenderTemplate);
        this.listener.listen(model.events, 'changePosition', () => this.forceUpdate());
        this.listener.listen(model.events, 'requestedFocus', () => {
            const element = findDOMNode(this) as HTMLElement;
            if (element) { element.focus(); }
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.typesObserver.stopListening();
        this.propertyObserver.stopListening();
        this.disposed = true;
    }

    shouldComponentUpdate(nextProps: OverlayedElementProps, nextState: OverlayedElementState) {
        return nextState !== this.state;
    }

    componentDidUpdate() {
        this.props.onResize(this.props.model, findDOMNode(this) as HTMLDivElement);
    }

    private templateProps(): TemplateProps {
        const {model, view} = this.props;

        const types = model.data.types.length > 0
            ? view.getElementTypeString(model.data) : 'Thing';
        const label = view.getLocalizedText(model.data.label.values).text;
        const {color, icon} = this.styleFor(model);
        const propsAsList = this.getPropertyTable();

        return {
            types,
            label,
            color,
            icon,
            iri: model.data.id,
            imgUrl: model.data.image,
            isExpanded: model.isExpanded,
            props: model.data.properties,
            propsAsList,
        };
    }

    private getPropertyTable(): Array<{ id: string; name: string; property: Property; }> {
        const {model, view} = this.props;

        if (!model.data.properties) { return []; }

        const propTable = Object.keys(model.data.properties).map(key => {
            const property = view ? view.model.getPropertyById(key) : undefined;
            const name = view ? view.getLocalizedText(property.label).text : uri2name(key);
            return {
                id: key,
                name: name,
                property: model.data.properties[key],
            };
        });

        propTable.sort((a, b) => {
            const aLabel = (a.name || a.id).toLowerCase();
            const bLabel = (b.name || b.id).toLowerCase();
            return aLabel.localeCompare(bLabel);
        });
        return propTable;
    }

    private styleFor(model: Element) {
        const {color: {h, c, l}, icon} = this.props.view.getTypeStyle(model.data.types);
        return {
            icon: icon ? icon : 'ontodia-default-icon',
            color: hcl(h, c, l).toString(),
        };
    }
}

class KeyedObserver {
    private observedKeys = createStringMap<Unsubscribe>();

    constructor(readonly subscribe: (key: string) => Unsubscribe | undefined) {}

    observe(keys: string[]) {
        const newObservedKeys = createStringMap<Unsubscribe>();

        for (const key of keys) {
            if (newObservedKeys[key]) { continue; }
            let token = this.observedKeys[key];
            if (!token) {
                token = this.subscribe(key);
            }
            newObservedKeys[key] = token;
        }

        for (const key in this.observedKeys) {
            if (!newObservedKeys[key]) {
                const unsubscribe = this.observedKeys[key];
                unsubscribe();
            }
        }

        this.observedKeys = newObservedKeys;
    }

    stopListening() {
        this.observe([]);
    }
}
