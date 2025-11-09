import React, { useState } from 'react';

const EventManagement = () => {
    const [events, setEvents] = useState([]);
    const [eventName, setEventName] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);

    const handleCreateEvent = () => {
        if (eventName && eventDate) {
            const newEvent = { name: eventName, date: eventDate };
            setEvents([...events, newEvent]);
            resetForm();
        }
    };

    const handleEditEvent = (index) => {
        setEventName(events[index].name);
        setEventDate(events[index].date);
        setEditingIndex(index);
    };

    const handleUpdateEvent = () => {
        if (editingIndex !== null) {
            const updatedEvents = events.map((event, index) =>
                index === editingIndex ? { name: eventName, date: eventDate } : event
            );
            setEvents(updatedEvents);
            resetForm();
        }
    };

    const handleDeleteEvent = (index) => {
        const updatedEvents = events.filter((_, i) => i !== index);
        setEvents(updatedEvents);
    };

    const resetForm = () => {
        setEventName('');
        setEventDate('');
        setEditingIndex(null);
    };

    return (
        <div>
            <h2>Event Management</h2>
            <input
                type="text"
                placeholder="Event Name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
            />
            <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
            />
            {editingIndex !== null ? (
                <button onClick={handleUpdateEvent}>Update Event</button>
            ) : (
                <button onClick={handleCreateEvent}>Create Event</button>
            )}
            <ul>
                {events.map((event, index) => (
                    <li key={index}>
                        {event.name} - {event.date}
                        <button onClick={() => handleEditEvent(index)}>Edit</button>
                        <button onClick={() => handleDeleteEvent(index)}>Delete</button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default EventManagement;