import { Dictionary, ElementModel, LinkModel } from '../data/model';
import { OrderedMap, createStringMap } from '../viewUtils/collections';
import { EventSource, Events, AnyEvent, AnyListener } from '../viewUtils/events';

import {
    Element as DiagramElement, ElementEvents,
    Link as DiagramLink, LinkEvents,
    FatLinkType, FatLinkTypeEvents,
    FatClassModel, FatClassModelEvents,
    RichProperty,
} from './elements';

export interface GraphEvents {
    changeCells: { source: Graph };
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    linkTypeEvent: AnyEvent<FatLinkTypeEvents>;
    classEvent: AnyEvent<FatClassModelEvents>;
}

export class Graph {
    private readonly source = new EventSource<GraphEvents>();
    readonly events: Events<GraphEvents> = this.source;

    private elements = new OrderedMap<DiagramElement>();
    private links = new OrderedMap<DiagramLink>();

    private classesById = createStringMap<FatClassModel>();
    private propertiesById = createStringMap<RichProperty>();

    private linkTypes = createStringMap<FatLinkType>();
    private nextLinkTypeIndex = 0;

    getElements() { return this.elements.items; }
    getLinks() { return this.links.items; }

    getLink(linkId: string): DiagramLink | undefined {
        return this.links.get(linkId);
    }

    findLink(linkModel: LinkModel): DiagramLink | undefined {
        const source = this.getElement(linkModel.sourceId);
        if (!source) { return undefined; }
        const index = findLinkIndex(source.links, linkModel);
        return index >= 0 ? source.links[index] : undefined;
    }

    sourceOf(link: DiagramLink) {
        return this.getElement(link.sourceId);
    }

    targetOf(link: DiagramLink) {
        return this.getElement(link.targetId);
    }

    getElement(elementId: string): DiagramElement | undefined {
        return this.elements.get(elementId);
    }

    addElement(element: DiagramElement): void {
        if (this.getElement(element.id)) {
            throw new Error(`Link type '${element.id}' already exists.`);
        }
        element.events.onAny(this.onElementEvent);
        this.elements.push(element.id, element);
        this.source.trigger('changeCells', {source: this});
    }

    private onElementEvent: AnyListener<ElementEvents> = (data, key) => {
        this.source.trigger('elementEvent', {key, data});
    }

    removeElement(elementId: string): void {
        const element = this.elements.delete(elementId);
        if (element) {
            const options = {silent: true};
            for (const link of element.links) {
                this.removeLink(link.id, options);
            }
            element.events.offAny(this.onElementEvent);
            this.source.trigger('changeCells', {source: this});
        }
    }

    createLink(params: {
        data: LinkModel;
        linkType: FatLinkType;
        suggestedId?: string;
        vertices?: Array<{ x: number; y: number; }>;
    }): DiagramLink | undefined {
        const {data, linkType, suggestedId, vertices} = params;

        const existingLink = this.findLink(data);
        if (existingLink) {
            existingLink.setLayoutOnly(false);
            return existingLink;
        }

        const shouldBeVisible = linkType.visible
            && this.getElement(data.sourceId)
            && this.getElement(data.targetId);

        if (!shouldBeVisible) {
            return undefined;
        }

        const suggestedIdAvailable = Boolean(suggestedId && !this.links.get(suggestedId));
        const newLinkId = suggestedIdAvailable ? suggestedId : `link_${generateRandomID()}`;

        const link = new DiagramLink({id: newLinkId, data, vertices});
        this.registerLink(link, linkType);
        return link;
    }

    private registerLink(link: DiagramLink, linkType: FatLinkType) {
        const {typeId} = link;

        if (link.typeIndex === undefined) {
            link.typeIndex = linkType.index;
        }

        this.sourceOf(link).links.push(link);
        if (link.sourceId !== link.targetId) {
            this.targetOf(link).links.push(link);
        }

        link.events.onAny(this.onLinkEvent);
        this.links.push(link.id, link);
        this.source.trigger('changeCells', {source: this});
    }

    private onLinkEvent: AnyListener<LinkEvents> = (data, key) => {
        this.source.trigger('linkEvent', {key, data});
    }

    removeLink(linkId: string, options?: { silent?: boolean }) {
        const link = this.links.delete(linkId);
        if (link) {
            const {typeId, sourceId, targetId} = link;
            link.events.offAny(this.onLinkEvent);
            this.removeLinkReferences({linkTypeId: typeId, sourceId, targetId});
            if (!(options && options.silent)) {
                this.source.trigger('changeCells', {source: this});
            }
        }
    }

    private removeLinkReferences(linkModel: LinkModel) {
        const source = this.getElement(linkModel.sourceId);
        removeLinkFrom(source && source.links, linkModel);

        const target = this.getElement(linkModel.targetId);
        removeLinkFrom(target && target.links, linkModel);
    }

    getLinkTypes(): FatLinkType[] {
        const result: FatLinkType[] = [];
        // tslint:disable-next-line:forin
        for (const linkTypeId in this.linkTypes) {
            result.push(this.linkTypes[linkTypeId]);
        }
        return result;
    }

    getLinkType(linkTypeId: string): FatLinkType | undefined {
        return this.linkTypes[linkTypeId];
    }

    addLinkType(linkType: FatLinkType): void {
        if (this.getLinkType(linkType.id)) {
            throw new Error(`Link type '${linkType.id}' already exists.`);
        }
        linkType.setIndex(this.nextLinkTypeIndex++);
        linkType.events.onAny(this.onLinkTypeEvent);
        this.linkTypes[linkType.id] = linkType;
    }

    private onLinkTypeEvent: AnyListener<FatLinkTypeEvents> = (data, key) => {
        this.source.trigger('linkTypeEvent', {key, data});
    }

    getProperty(propertyId: string): RichProperty | undefined {
        return this.propertiesById[propertyId];
    }

    addProperty(property: RichProperty): void {
        if (this.getProperty(property.id)) {
            throw new Error(`Property '${property.id}' already exists.`);
        }
        this.propertiesById[property.id] = property;
    }

    getClass(classId: string): FatClassModel | undefined {
        return this.classesById[classId];
    }

    getClasses(): FatClassModel[] {
        const classes: FatClassModel[] = [];
        // tslint:disable-next-line:forin
        for (const classId in this.classesById) {
            classes.push(this.classesById[classId]);
        }
        return classes;
    }

    addClass(classModel: FatClassModel): void {
        if (this.getClass(classModel.id)) {
            throw new Error(`Class '${classModel.id}' already exists.`);
        }
        classModel.events.onAny(this.onClassEvent);
        this.classesById[classModel.id] = classModel;
    }

    private onClassEvent: AnyListener<FatClassModelEvents> = (data, key) => {
        this.source.trigger('classEvent', {key, data});
    }
}

function removeLinkFrom(links: DiagramLink[], model: LinkModel) {
    if (!links) { return; }
    const index = findLinkIndex(links, model);
    if (index >= 0) {
        links.splice(index, 1);
    }
}

function findLinkIndex(haystack: DiagramLink[], needle: LinkModel) {
    const {sourceId, targetId, linkTypeId} = needle;
    for (let i = 0; i < haystack.length; i++) {
        const link = haystack[i];
        if (link.sourceId === sourceId &&
            link.targetId === targetId &&
            link.typeId === linkTypeId
        ) {
            return i;
        }
    }
    return -1;
}

/** Generates random 16-digit hexadecimal string. */
function generateRandomID() {
    function randomHalfDigits() {
        return Math.floor((1 + Math.random()) * 0x100000000)
            .toString(16).substring(1);
    }
    // generate by half because of restricted numerical precision
    return randomHalfDigits() + randomHalfDigits();
}
