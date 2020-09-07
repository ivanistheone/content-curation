import { mapGetters } from 'vuex';
import debounce from 'lodash/debounce';
import baseMixin from './base';
import { DraggableFlags } from 'shared/vuex/draggablePlugin/module/constants';
import { extendAndRender } from 'shared/utils';

export default {
  mixins: [baseMixin],
  props: {
    /**
     * The draggable container that's the immediate draggable ancestor of the handle needs to
     * allow separate event binding properties, in this case, whether to use capturing
     */
    useCapture: {
      type: Boolean,
      default: false,
      required: false,
    },
    draggableSize: {
      type: Number,
      default: null,
    },
    dropEffect: {
      type: String,
      default: 'copy',
      validator(val) {
        return Boolean(['copy', 'move', 'none'].find(effect => effect === val));
      },
    },
    beforeStyle: {
      type: [Function, Boolean],
      default: size => ({
        '::before': {
          height: `${size}px`,
        },
      }),
    },
    afterStyle: {
      type: [Function, Boolean],
      default: size => ({
        '::after': {
          height: `${size}px`,
        },
      }),
    },
  },
  data() {
    return {
      draggableDragEntered: false,
      hoverDraggableSize: this.draggableSize,
      debouncedEmitDraggableDragLeave: () => {},
    };
  },
  computed: {
    ...mapGetters('draggable', [
      'activeDraggableSize',
      'hoverDraggableRegionId',
      'hoverDraggableCollectionId',
      'hoverDraggableItemId',
      'lowermostHoverDraggable',
    ]),
    /**
     * To be overridden if necessary to return whether the user is hovering over a draggable
     * descendant in this draggable container
     * @abstract
     * @return {Boolean}
     */
    hasDescendantHoverDraggable() {
      return false;
    },
    /**
     * To be overridden with draggable type specific Vuex getter
     * @return {string|null}
     */
    hoverDraggableId() {
      return null;
    },
    /**
     * To be overridden with draggable type specific Vuex getter
     * @return {number|null}
     */
    hoverDraggableSection() {
      return null;
    },
    /**
     * To be overridden with draggable type specific Vuex getter
     * @return {number|null}
     */
    draggingTargetSection() {
      return null;
    },

    isInActiveDraggableUniverse() {
      return this.activeDraggableUniverse === this.draggableUniverse;
    },
    isActiveDraggable() {
      return this.activeDraggableId === this.draggableId;
    },
    existsOtherHoverDraggable() {
      const { id, type } = this.lowermostHoverDraggable;
      return id && (id !== this.draggableId || type !== this.draggableType);
    },
    isDraggingOver() {
      return this.hoverDraggableId === this.draggableId;
    },
    activeDropEffect() {
      return this.isInActiveDraggableUniverse ? this.dropEffect : 'none';
    },
    isDropAllowed() {
      return this.activeDropEffect !== 'none';
    },
    beforeComputedClass() {
      return this.$computedClass(this.beforeStyle(this.size) || {});
    },
    afterComputedClass() {
      return this.$computedClass(this.afterStyle(this.size) || {});
    },
    size() {
      return this.isActiveDraggable
        ? this.activeDraggableSize
        : Math.min(this.hoverDraggableSize, this.activeDraggableSize);
    },
  },
  watch: {
    /**
     * Dispatches an update to the draggable size. We should potentially debounce this since
     * the dragging as animations that may cause this value to be different if the user drags,
     * drops, and drags again very quickly
     *
     * TODO: Update to set width instead based off new `draggableAxis` property if necessary
     *
     * @param isActive
     */
    isActiveDraggable(isActive) {
      if (isActive) {
        this.setActiveDraggableSize({ size: this.draggableSize || this.$el.offsetHeight });
      }
    },
    activeDraggableId(id) {
      if (id) {
        this.hoverDraggableSize = this.draggableSize || this.$el.offsetHeight || 0;
      }
    },
    hoverDraggableId(id) {
      if (id && id !== this.draggableId) {
        this.debouncedEmitDraggableDragLeave();
      }
    },
  },
  methods: {
    /**
     * To be overridden with draggable type specific Vuex action
     * @abstract
     * @param {Object} payload
     */
    setHoverDraggable() {},
    /**
     * To be overridden with draggable type specific Vuex action
     * @abstract
     * @param {Object} payload
     */
    updateHoverDraggable() {},
    /**
     * To be overridden with draggable type specific Vuex action
     * @abstract
     * @param {Object} payload
     */
    resetHoverDraggable() {},
    /**
     * To be overridden with draggable type specific Vuex action
     * @abstract
     * @param {Number} size
     */
    setActiveDraggableSize() {},
    /**
     * @param {DragEvent} e
     */
    emitDraggableDragEnter(e) {
      if (!this.draggableDragEntered) {
        this.draggableDragEntered = true;
        this.$emit('draggableDragEnter', e);

        // Ensures we're communicating to the browser the mode of transfer, like move, copy, or both
        if (e.dataTransfer.dropEffect !== this.activeDropEffect) {
          e.dataTransfer.dropEffect = this.activeDropEffect;
        }

        this.emitDraggableDragOver(e);
      }
    },
    /**
     * The dragover event should be continuously fired, but some browsers don't do that
     * @param {DragEvent} e
     */
    emitDraggableDragOver(e) {
      if (!this.draggableDragEntered) {
        return this.emitDraggableDragEnter(e);
      }

      // Update hover draggable information, which will also set it as the draggable component
      const { clientX, clientY } = e;
      this.$emit('draggableDragOver', { clientX, clientY });
      this.updateHoverDraggable({
        id: this.draggableId,
        universe: this.draggableUniverse,
        clientX,
        clientY,
        ...this.getDraggableBounds(),
      });
    },
    /**
     * @param {DragEvent} e
     */
    emitDraggableDragLeave(e) {
      if (this.draggableDragEntered) {
        this.$emit('draggableDragLeave', e);
        this.resetHoverDraggable({ id: this.draggableId, universe: this.draggableUniverse });
        this.draggableDragEntered = false;
      }
    },
    emitDraggableDrop(e) {
      if (this.isDropAllowed) {
        this.emitDraggableDragOver(e);
        this.$emit('draggableDrop', e);
      }
    },
    /**
     * Overridable method for serving the scoped slot properties
     * @returns {Object<Boolean|String>}
     */
    draggableScopedSlotProps() {
      const { isInActiveDraggableUniverse, isDraggingOver, isActiveDraggable, dropEffect } = this;
      return {
        isInActiveDraggableUniverse,
        isDraggingOver,
        isActiveDraggable,
        dropEffect,
      };
    },
    /**
     * Add custom method for rendering
     */
    extendAndRender,
  },
  created() {
    // Debounce the leave emitter since it can get fired multiple times, and there are some browser
    // inconsistencies that make relying on the drag events difficult. This helps
    this.debouncedEmitDraggableDragLeave = debounce(e => this.emitDraggableDragLeave(e), 500);
  },
  render() {
    const emitDraggableDragLeave = this.debouncedEmitDraggableDragLeave;

    // Add event key modifier if we're supposed to use capturing
    const eventKey = eventName => {
      return this.useCapture ? `!${eventName}` : eventName;
    };

    const dropCondition =
      this.isInActiveDraggableUniverse &&
      this.isDraggingOver &&
      !this.hasDescendantHoverDraggable &&
      !this.isActiveDraggable;

    // TODO: Add `draggableAxis` prop and switch direction checking
    // Styling explicitly for when we're dragging this item, so when we've picked this up
    // and no longer hovering over it's original placement, the height will go to zero
    let style = {};
    if (this.isActiveDraggable) {
      style.height = this.existsOtherHoverDraggable ? '0px' : `${this.size}px`;
    }

    // Swap section based off whether we just left a descendent draggable
    const beforeCondition =
      dropCondition && Boolean(this.draggingTargetSection & DraggableFlags.TOP);
    const afterCondition =
      dropCondition && Boolean(this.draggingTargetSection & DraggableFlags.BOTTOM);

    const dynamicClasses = {
      [`draggable-${this.draggableType}`]: true,
      'in-draggable-universe': this.isInActiveDraggableUniverse,
      'dragging-over': this.isDraggingOver,
      'dragging-over-top':
        dropCondition && Boolean(this.hoverDraggableSection & DraggableFlags.TOP),
      'dragging-over-bottom':
        dropCondition && Boolean(this.hoverDraggableSection & DraggableFlags.BOTTOM),
      'drag-target-before': beforeCondition,
      'drag-target-after': afterCondition,
      'active-draggable': this.isActiveDraggable,
    };

    if (this.beforeStyle) {
      dynamicClasses[this.beforeComputedClass] = beforeCondition;
    }
    if (this.afterStyle) {
      dynamicClasses[this.afterComputedClass] = afterCondition;
    }

    return this.extendAndRender(
      'default',
      {
        class: dynamicClasses,
        style,
        attrs: {
          'aria-dropeffect': this.activeDropEffect,
        },
        on: {
          [eventKey('dragenter')]: e => {
            // Stop any pending leave events
            emitDraggableDragLeave.cancel();
            this.emitDraggableDragEnter(e);
          },
          [eventKey('dragover')]: e => {
            emitDraggableDragLeave.cancel();
            this.emitDraggableDragOver(e);
          },
          [eventKey('dragleave')]: e => {
            emitDraggableDragLeave(e);
          },
        },
      },
      this.draggableScopedSlotProps()
    );
  },
};
